import { clsx } from 'clsx';

interface AvatarProps {
  name?: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const DICEBEAR_SIZES = { sm: 32, md: 40, lg: 48, xl: 64 };

function dicebearUrl(seed: string, px: number) {
  const s = encodeURIComponent(seed.trim() || '?');
  return `https://api.dicebear.com/9.x/initials/svg?seed=${s}&size=${px}&backgroundColor=072061&textColor=ffffff&fontWeight=700&fontSize=40`;
}

export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const sizes = { sm: 'h-8 w-8', md: 'h-10 w-10', lg: 'h-12 w-12', xl: 'h-16 w-16' };
  const px = DICEBEAR_SIZES[size];
  const imgSrc = src ?? dicebearUrl(name ?? '?', px);
  return (
    <img
      src={imgSrc}
      alt={name ?? 'avatar'}
      width={px}
      height={px}
      className={clsx('rounded-full object-cover bg-navy', sizes[size], className)}
    />
  );
}
