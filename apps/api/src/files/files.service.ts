import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { extname } from 'path';

@Injectable()
export class FilesService {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;
  private readonly logger = new Logger(FilesService.name);

  constructor(private config: ConfigService) {
    this.bucket = config.getOrThrow<string>('R2_BUCKET_NAME');
    this.publicUrl = config.getOrThrow<string>('R2_PUBLIC_URL');

    this.s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${config.getOrThrow<string>('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.getOrThrow<string>('R2_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow<string>('R2_SECRET_ACCESS_KEY'),
      },
    });
  }

  /**
   * A Word document (.docx) as lesson text: headings, bold and lists carry over, and each picture
   * in it is stored with the lesson files and shown in place. Old .doc files and PDFs can't be read this way.
   */
  async importDocx(file: Express.Multer.File): Promise<{ html: string; images: number; warnings: string[] }> {
    const name = file.originalname.toLowerCase();
    if (name.endsWith('.pdf')) throw new BadRequestException('A PDF can’t be turned into editable text. Attach it to the lesson instead: students can open and download it.');
    if (name.endsWith('.doc')) throw new BadRequestException('This is an older Word file (.doc). Open it in Word, choose Save As → Word Document (.docx), then import that.');
    if (!name.endsWith('.docx')) throw new BadRequestException('Choose a Word document (.docx)');
    // Loaded only when someone imports, so it adds nothing to start-up
    const mammoth = await import('mammoth');
    let images = 0;
    const result = await mammoth.convertToHtml({ buffer: file.buffer }, {
      // Word's headings become the lesson's section headings (h2 and h3 build the lesson's contents list)
      styleMap: ["p[style-name='Title'] => h2:fresh", "p[style-name='Heading 1'] => h2:fresh", "p[style-name='Heading 2'] => h3:fresh", "p[style-name='Heading 3'] => h3:fresh"],
      convertImage: mammoth.images.imgElement(async (image: { contentType: string; read: () => Promise<Buffer> }) => {
        const ext = ({ 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' } as Record<string, string>)[image.contentType] ?? '.png';
        const buffer = await image.read();
        const { url } = await this.upload({ buffer, originalname: `image${ext}`, mimetype: image.contentType, size: buffer.length } as Express.Multer.File, 'lesson-files');
        images++;
        return { src: url };
      }),
    });
    const html = result.value.trim();
    if (!html) throw new BadRequestException('That document looks empty');
    return { html, images, warnings: result.messages.filter(m => m.type === 'warning').slice(0, 5).map(m => m.message) };
  }

  /**
   * Upload a file buffer to R2 and return its public URL.
   * Used by: teacher application documents, assignment submission files, course covers, lesson pictures and files.
   */
  async upload(
    file: Express.Multer.File,
    folder: 'teacher-docs' | 'submissions' | 'avatars' | 'certificates' | 'messages' | 'covers' | 'lesson-files',
  ): Promise<{ url: string; key: string }> {
    const ext = extname(file.originalname).toLowerCase();
    const key = `${folder}/${randomUUID()}${ext}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ContentLength: file.size,
      }),
    );

    const url = `${this.publicUrl}/${key}`;
    this.logger.log(`Uploaded ${key}`);
    return { url, key };
  }

  /**
   * Pre-signed PUT so large videos go browser → R2 directly instead of through API memory.
   * Content-Type and Content-Length are signed, so the URL can't be reused for a bigger or different file.
   * Requires a CORS rule on the bucket allowing PUT from the portal origin.
   */
  async presignedVideoUpload(
    folder: 'intro-videos' | 'onboarding-videos' | 'lesson-videos',
    contentType: string,
    size: number,
  ): Promise<{ uploadUrl: string; url: string; key: string }> {
    const ext = { 'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm', 'text/vtt': '.vtt' }[contentType] ?? '';
    const key = `${folder}/${randomUUID()}${ext}`;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: size,
    });
    const uploadUrl = await getSignedUrl(this.s3, command, {
      expiresIn: 900,
      signableHeaders: new Set(['content-type', 'content-length']),
    });
    return { uploadUrl, url: `${this.publicUrl}/${key}`, key };
  }

  /** Delete a file by its R2 key. */
  async delete(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    this.logger.log(`Deleted ${key}`);
  }

  /**
   * Generate a short-lived pre-signed GET URL for a known R2 object key.
   * Useful for private assignment submissions viewed by a teacher.
   */
  async presignedDownload(key: string, expiresInSeconds = 300): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.s3, command, { expiresIn: expiresInSeconds });
  }

  /**
   * Accept either a raw R2 key or a full public URL and return a short-lived
   * signed GET URL. Non-R2 URLs (YouTube, Vimeo, external CDN) are returned
   * unchanged — they don't need signing.
   *
   * Default: 2-hour window (7200 s) — long enough for a full lesson session.
   */
  /** True for files stored in our bucket (bare keys or our public URL), which must be served signed. */
  isOwnFile(urlOrKey: string | null | undefined): boolean {
    if (!urlOrKey) return false;
    return !urlOrKey.startsWith('http') || urlOrKey.startsWith(this.publicUrl);
  }

  async signUrl(urlOrKey: string, expiresInSeconds = 7200): Promise<string> {
    // If it's already a bare key (no protocol) sign it directly
    if (!urlOrKey.startsWith('http')) {
      return this.presignedDownload(urlOrKey, expiresInSeconds);
    }
    // If it matches our R2 public URL, extract the key and sign
    if (urlOrKey.startsWith(this.publicUrl)) {
      const key = urlOrKey.slice(this.publicUrl.length + 1); // strip trailing slash
      return this.presignedDownload(key, expiresInSeconds);
    }
    // External URL (YouTube, Vimeo, etc.) — return as-is
    return urlOrKey;
  }
}
