// ─────────────────────────────────────────────────────────────────────────────
// CareerPath Africa — Branded Email Templates
// All styles are inline (Gmail compatibility). Layout is table-based (Outlook).
// Brand palette: Navy #072061 · Azure #5889FA · Royal #405FAD · Cloud #E6ECFD
// ─────────────────────────────────────────────────────────────────────────────

const PORTAL_URL = 'https://portal.careerpathafrica.com';

// ── Solar SVG icon paths (extracted from @iconify-json/solar) ────────────────
const SVG_PATHS = {
  shieldCheck:     `<path fill="currentColor" fill-rule="evenodd" d="M3.37752 5.08241C3 5.62028 3 7.21907 3 10.4167V11.9914C3 17.6294 7.23896 20.3655 9.89856 21.5273C10.62 21.8424 10.9807 22 12 22C13.0193 22 13.38 21.8424 14.1014 21.5273C16.761 20.3655 21 17.6294 21 11.9914V10.4167C21 7.21907 21 5.62028 20.6225 5.08241C20.245 4.54454 18.7417 4.02996 15.7351 3.00079L15.1623 2.80472C13.595 2.26824 12.8114 2 12 2C11.1886 2 10.405 2.26824 8.83772 2.80472L8.26491 3.00079C5.25832 4.02996 3.75503 4.54454 3.37752 5.08241ZM15.0595 10.4995C15.3353 10.1905 15.3085 9.71642 14.9995 9.44055C14.6905 9.16467 14.2164 9.19151 13.9405 9.50049L10.9286 12.8739L10.0595 11.9005C9.78358 11.5915 9.30947 11.5647 9.00049 11.8405C8.69151 12.1164 8.66467 12.5905 8.94055 12.8995L10.3691 14.4995C10.5114 14.6589 10.7149 14.75 10.9286 14.75C11.1422 14.75 11.3457 14.6589 11.488 14.4995L15.0595 10.4995Z" clip-rule="evenodd"/>`,
  checkCircle:     `<path fill="currentColor" fill-rule="evenodd" d="M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12ZM16.0303 8.96967C16.3232 9.26256 16.3232 9.73744 16.0303 10.0303L11.0303 15.0303C10.7374 15.3232 10.2626 15.3232 9.96967 15.0303L7.96967 13.0303C7.67678 12.7374 7.67678 12.2626 7.96967 11.9697C8.26256 11.6768 8.73744 11.6768 9.03033 11.9697L10.5 13.4393L12.7348 11.2045L14.9697 8.96967C15.2626 8.67678 15.7374 8.67678 16.0303 8.96967Z" clip-rule="evenodd"/>`,
  medal:           `<g fill="currentColor"><path fill-rule="evenodd" d="M12 16C15.866 16 19 12.866 19 9C19 5.13401 15.866 2 12 2C8.13401 2 5 5.13401 5 9C5 12.866 8.13401 16 12 16ZM12 6C11.7159 6 11.5259 6.34084 11.1459 7.02251L11.0476 7.19887C10.9397 7.39258 10.8857 7.48944 10.8015 7.55334C10.7173 7.61725 10.6125 7.64097 10.4028 7.68841L10.2119 7.73161C9.47396 7.89857 9.10501 7.98205 9.01723 8.26432C8.92945 8.54659 9.18097 8.84072 9.68403 9.42898L9.81418 9.58117C9.95713 9.74833 10.0286 9.83191 10.0608 9.93531C10.0929 10.0387 10.0821 10.1502 10.0605 10.3733L10.0408 10.5763C9.96476 11.3612 9.92674 11.7536 10.1565 11.9281C10.3864 12.1025 10.7318 11.9435 11.4227 11.6254L11.6014 11.5431C11.7978 11.4527 11.8959 11.4075 12 11.4075C12.1041 11.4075 12.2022 11.4527 12.3986 11.5431L12.5773 11.6254C13.2682 11.9435 13.6136 12.1025 13.8435 11.9281C14.0733 11.7536 14.0352 11.3612 13.9592 10.5763L13.9395 10.3733C13.9179 10.1502 13.9071 10.0387 13.9392 9.93531C13.9714 9.83191 14.0429 9.74833 14.1858 9.58118L14.316 9.42898C14.819 8.84072 15.0706 8.54659 14.9828 8.26432C14.895 7.98205 14.526 7.89857 13.7881 7.73161L13.5972 7.68841C13.3875 7.64097 13.2827 7.61725 13.1985 7.55334C13.1143 7.48944 13.0603 7.39258 12.9524 7.19887L12.8541 7.02251C12.4741 6.34084 12.2841 6 12 6Z" clip-rule="evenodd"/><path d="M4.49517 12.9946L2.99206 14.551C2.45194 15.1102 2.18188 15.3898 2.08843 15.6266C1.87548 16.1662 2.05772 16.7648 2.52138 17.0486C2.72486 17.1732 3.09187 17.212 3.82589 17.2897C4.2403 17.3335 4.44755 17.3554 4.6211 17.4219C5.00966 17.5709 5.31191 17.8838 5.45575 18.2861C5.52 18.4658 5.54117 18.6804 5.5835 19.1095C5.65848 19.8695 5.69597 20.2495 5.81628 20.4602C6.09042 20.9403 6.66852 21.129 7.18967 20.9085C7.41837 20.8117 7.68843 20.5321 8.22855 19.9729L10.7106 17.4029C8.01306 16.9924 5.73225 15.314 4.49517 12.9946Z"/><path d="M13.2894 17.4029L15.7715 19.9729C16.3116 20.5321 16.5816 20.8117 16.8103 20.9085C17.3315 21.129 17.9096 20.9403 18.1837 20.4602C18.304 20.2495 18.3415 19.8695 18.4165 19.1095C18.4588 18.6804 18.48 18.4658 18.5442 18.2861C18.6881 17.8838 18.9903 17.5709 19.3789 17.4219C19.5525 17.3554 19.7597 17.3335 20.1741 17.2897C20.9081 17.212 21.2751 17.1732 21.4786 17.0486C21.9423 16.7648 22.1245 16.1662 21.9116 15.6266C21.8181 15.3898 21.5481 15.1102 21.0079 14.551L19.5048 12.9946C18.2677 15.314 15.9869 16.9924 13.2894 17.4029Z"/></g>`,
  global:          `<g fill="currentColor"><path fill-rule="evenodd" d="M2.02783 11.25C2.41136 6.07745 6.72957 2 12.0001 2C11.1693 2 10.4295 2.36421 9.82093 2.92113C9.21541 3.47525 8.70371 4.24878 8.28983 5.16315C7.87352 6.08292 7.55013 7.15868 7.33126 8.32611C7.1558 9.26194 7.04903 10.2485 7.01344 11.25H2.02783ZM2.02783 12.75H7.01344C7.04903 13.7515 7.1558 14.7381 7.33126 15.6739C7.55013 16.8413 7.87351 17.9171 8.28983 18.8368C8.70371 19.7512 9.21541 20.5247 9.82093 21.0789C10.4295 21.6358 11.1693 22 12.0001 22C6.72957 22 2.41136 17.9226 2.02783 12.75Z" clip-rule="evenodd"/><path d="M12.0001 3.39535C11.7251 3.39535 11.3699 3.51236 10.9567 3.89042C10.5406 4.27126 10.1239 4.86815 9.75585 5.68137C9.3902 6.4892 9.09329 7.46441 8.88897 8.55419C8.72806 9.41242 8.62824 10.3222 8.59321 11.25H15.4071C15.372 10.3222 15.2722 9.41242 15.1113 8.5542C14.907 7.46441 14.6101 6.48921 14.2444 5.68137C13.8763 4.86815 13.4597 4.27126 13.0435 3.89042C12.6304 3.51236 12.2751 3.39535 12.0001 3.39535Z"/><path d="M8.88897 15.4458C9.09329 16.5356 9.3902 17.5108 9.75585 18.3186C10.1239 19.1319 10.5406 19.7287 10.9567 20.1096C11.3698 20.4876 11.7251 20.6047 12.0001 20.6047C12.2751 20.6047 12.6304 20.4876 13.0435 20.1096C13.4597 19.7287 13.8763 19.1319 14.2444 18.3186C14.6101 17.5108 14.907 16.5356 15.1113 15.4458C15.2722 14.5876 15.372 13.6778 15.4071 12.75H8.59321C8.62824 13.6778 8.72806 14.5876 8.88897 15.4458Z"/><path d="M12.0001 2C12.831 2 13.5708 2.36421 14.1793 2.92113C14.7849 3.47525 15.2966 4.24878 15.7104 5.16315C16.1267 6.08292 16.4501 7.15868 16.669 8.32612C16.8445 9.26194 16.9512 10.2485 16.9868 11.25H21.9724C21.5889 6.07745 17.2707 2 12.0001 2Z"/><path d="M16.669 15.6739C16.4501 16.8413 16.1267 17.9171 15.7104 18.8368C15.2966 19.7512 14.7849 20.5247 14.1793 21.0789C13.5708 21.6358 12.831 22 12.0001 22C17.2707 22 21.5889 17.9226 21.9724 12.75H16.9868C16.9512 13.7515 16.8445 14.7381 16.669 15.6739Z"/></g>`,
  card:            `<g fill="currentColor"><path d="M14.0002 4H10.0002C6.22893 4 4.34331 4 3.17174 5.17157C2.32819 6.01511 2.09201 7.22882 2.02588 9.25H21.9744C21.9083 7.22882 21.6721 6.01511 20.8286 5.17157C19.657 4 17.7714 4 14.0002 4Z"/><path fill-rule="evenodd" d="M22 12C22 15.7712 21.9997 17.6566 20.8281 18.8281C19.6566 19.9997 17.7712 20 14 20H10C6.22876 20 4.34345 19.9997 3.17188 18.8281C2.0003 17.6566 2 15.7712 2 12C2 11.5581 2.00007 11.142 2.00195 10.75H21.998C21.9999 11.142 22 11.5581 22 12ZM6 15.25C5.58579 15.25 5.25 15.5858 5.25 16C5.25 16.4142 5.58579 16.75 6 16.75H10C10.4142 16.75 10.75 16.4142 10.75 16C10.75 15.5858 10.4142 15.25 10 15.25H6ZM12.5 15.25C12.0858 15.25 11.75 15.5858 11.75 16C11.75 16.4142 12.0858 16.75 12.5 16.75H14C14.4142 16.75 14.75 16.4142 14.75 16C14.75 15.5858 14.4142 15.25 14 15.25H12.5Z" clip-rule="evenodd"/></g>`,
  video:           `<path fill="currentColor" fill-rule="evenodd" d="M2 12.5V11.5C2 8.21252 2 6.56878 2.90796 5.46243C3.07418 5.25989 3.25989 5.07418 3.46243 4.90796C4.56878 4 6.21252 4 9.5 4C12.7875 4 14.4312 4 15.5376 4.90796C15.7401 5.07418 15.9258 5.25989 16.092 5.46243C16.7936 6.3173 16.9531 7.49303 16.9893 9.50002L17.6584 9.17082C19.6042 8.19788 20.5772 7.7114 21.2886 8.15107C22 8.59075 22 9.67853 22 11.8541V12.1459C22 14.3215 22 15.4093 21.2886 15.8489C20.5772 16.2886 19.6042 15.8021 17.6584 14.8292L16.9893 14.5C16.9531 16.507 16.7936 17.6827 16.092 18.5376C15.9258 18.7401 15.7401 18.9258 15.5376 19.092C14.4312 20 12.7875 20 9.5 20C6.21252 20 4.56878 20 3.46243 19.092C3.25989 18.9258 3.07418 18.7401 2.90796 18.5376C2 17.4312 2 15.7875 2 12.5ZM13.5607 9.56066C14.1464 8.97487 14.1464 8.02513 13.5607 7.43934C12.9749 6.85355 12.0251 6.85355 11.4393 7.43934C10.8536 8.02513 10.8536 8.97487 11.4393 9.56066C12.0251 10.1464 12.9749 10.1464 13.5607 9.56066Z" clip-rule="evenodd"/>`,
  docText:         `<path fill="currentColor" fill-rule="evenodd" d="M4.17157 3.17157C3 4.34315 3 6.22876 3 10V14C3 17.7712 3 19.6569 4.17157 20.8284C5.34315 22 7.22876 22 11 22H13C16.7712 22 18.6569 22 19.8284 20.8284C21 19.6569 21 17.7712 21 14V10C21 6.22876 21 4.34315 19.8284 3.17157C18.6569 2 16.7712 2 13 2H11C7.22876 2 5.34315 2 4.17157 3.17157ZM7.25 8C7.25 7.58579 7.58579 7.25 8 7.25H16C16.4142 7.25 16.75 7.58579 16.75 8C16.75 8.41421 16.4142 8.75 16 8.75H8C7.58579 8.75 7.25 8.41421 7.25 8ZM7.25 12C7.25 11.5858 7.58579 11.25 8 11.25H16C16.4142 11.25 16.75 11.5858 16.75 12C16.75 12.4142 16.4142 12.75 16 12.75H8C7.58579 12.75 7.25 12.4142 7.25 12ZM8 15.25C7.58579 15.25 7.25 15.5858 7.25 16C7.25 16.4142 7.58579 16.75 8 16.75H13C13.4142 16.75 13.75 16.4142 13.75 16C13.75 15.5858 13.4142 15.25 13 15.25H8Z" clip-rule="evenodd"/>`,
  diploma:         `<g fill="currentColor"><path fill-rule="evenodd" d="M2 12V8C2 5.17157 2 3.75736 2.87868 2.87868C3.75736 2 5.17157 2 8 2H16C18.8284 2 20.2426 2 21.1213 2.87868C22 3.75736 22 5.17157 22 8V12C22 14.8284 22 16.2426 21.1213 17.1213C20.645 17.5977 20.0113 17.8158 19.0802 17.9156C19.0062 17.8157 18.9362 17.737 18.8862 17.6821C18.7701 17.5544 18.6228 17.4092 18.48 17.2684L16.987 15.7962L16.4357 15.2377C16.0733 13.1151 14.2255 11.5 12.0001 11.5C9.77461 11.5 7.9268 13.1151 7.56446 15.2377L7.01311 15.7962L5.5202 17.2683C5.37739 17.4091 5.23008 17.5543 5.11392 17.6821C5.06395 17.737 4.9939 17.8157 4.9199 17.9156C3.98877 17.8158 3.35503 17.5977 2.87868 17.1213C2 16.2426 2 14.8284 2 12ZM9 5.25C8.58579 5.25 8.25 5.58579 8.25 6C8.25 6.41421 8.58579 6.75 9 6.75H15C15.4142 6.75 15.75 6.41421 15.75 6C15.75 5.58579 15.4142 5.25 15 5.25H9ZM6.25 9.5C6.25 9.08579 6.58579 8.75 7 8.75H17C17.4142 8.75 17.75 9.08579 17.75 9.5C17.75 9.91421 17.4142 10.25 17 10.25H7C6.58579 10.25 6.25 9.91421 6.25 9.5Z" clip-rule="evenodd"/><path d="M15 16C15 17.6569 13.6569 19 12 19C10.3431 19 9 17.6569 9 16C9 14.3431 10.3431 13 12 13C13.6569 13 15 14.3431 15 16Z"/><path d="M9.00111 15.9174C9.00037 15.9449 9 15.9724 9 16C9 17.6569 10.3431 19 12 19C13.6569 19 15 17.6569 15 16C15 15.9724 14.9996 15.9449 14.9989 15.9174C14.9551 14.2987 13.6292 13 12 13C10.4467 13 9.16912 14.1805 9.01549 15.6933C9.00798 15.7672 9.00315 15.842 9.00111 15.9174Z"/><path d="M7.6757 17.2494L6.59523 18.3148C6.27116 18.6344 6.10913 18.7942 6.05306 18.9295C5.92529 19.2378 6.03463 19.5799 6.31283 19.7421C6.43492 19.8132 6.65512 19.8354 7.09553 19.8798C7.3442 19.9048 7.46853 19.9173 7.57266 19.9554C7.80579 20.0405 7.98715 20.2193 8.07345 20.4492C8.112 20.5519 8.1247 20.6745 8.1501 20.9197C8.19509 21.354 8.21758 21.5711 8.28977 21.6915C8.45425 21.9659 8.80111 22.0737 9.1138 21.9477C9.25102 21.8924 9.41306 21.7326 9.73713 21.413L10.8175 20.343C9.30505 19.9322 8.10917 18.7524 7.6757 17.2494Z"/><path d="M13.1825 20.343L14.2629 21.413C14.5869 21.7326 14.749 21.8924 14.8862 21.9477C15.1989 22.0737 15.5457 21.9659 15.7102 21.6915C15.7824 21.5711 15.8049 21.354 15.8499 20.9197C15.8753 20.6745 15.888 20.5519 15.9265 20.4492C16.0129 20.2193 16.1942 20.0405 16.4273 19.9554C16.5315 19.9173 16.6558 19.9048 16.9045 19.8798C17.3449 19.8354 17.5651 19.8132 17.6872 19.7421C17.9654 19.5799 18.0747 19.2378 17.9469 18.9295C17.8909 18.7942 17.7288 18.6344 17.4048 18.3148L16.3243 17.2494C15.8908 18.7524 14.6949 19.9322 13.1825 20.343Z"/></g>`,
};

/** Renders an inline Solar SVG icon, email-safe. */
function icon(key: keyof typeof SVG_PATHS, size: number, color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" style="display:block;color:${color}">${SVG_PATHS[key]}</svg>`;
}

// ── Shared primitives ────────────────────────────────────────────────────────

const FONT = "'Bricolage Grotesque',system-ui,-apple-system,'Segoe UI',Arial,sans-serif";
const BLUE = '#3F6FE8';

/** "careerpath." with the white C tile, for the blue header. */
function logo(): string {
  return `
    <table cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td width="26" height="26" style="width:26px;height:26px;background:#ffffff;border-radius:6px;text-align:center;vertical-align:middle;line-height:26px">
          <span style="color:${BLUE};font-size:13px;font-weight:900;font-family:${FONT}">C</span>
        </td>
        <td style="padding-left:8px;vertical-align:middle">
          <span style="color:#072061;font-size:16px;font-weight:800;font-family:${FONT};letter-spacing:-0.3px">careerpath</span><span style="color:#ffffff;font-size:16px;font-weight:800;font-family:${FONT}">.</span>
        </td>
      </tr>
    </table>`;
}

/** Two-line headline: first line navy, second line white. */
function headline(first: string, second = ''): string {
  return `<h1 style="margin:22px 0 0;font-size:30px;line-height:1.08;font-weight:800;letter-spacing:-0.8px;color:#072061;font-family:${FONT}">${first}${second ? `<br/><span style="color:#ffffff">${second}</span>` : ''}</h1>`;
}

function ctaButton(label: string, href: string, _color?: string): string {
  return `
    <table cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 6px">
      <tr>
        <td style="background:${BLUE};border-radius:6px">
          <a href="${href}"
             style="display:inline-block;padding:13px 22px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;font-family:${FONT}">
            ${label}
          </a>
        </td>
      </tr>
    </table>`;
}

/** Big code in a pale blue box (sign-in codes, school codes). */
function codeBox(code: string, size = 30): string {
  return `
    <table cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px">
      <tr>
        <td style="background:#EAF0FF;border-radius:8px;padding:12px 20px">
          <span style="font-size:${size}px;font-weight:800;letter-spacing:0.25em;color:#072061;font-family:${FONT}">${code}</span>
        </td>
      </tr>
    </table>`;
}

function divider(): string {
  return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:22px 0">
    <tr><td style="border-top:1px solid #E4E9F3;font-size:0;line-height:0">&nbsp;</td></tr>
  </table>`;
}

// ── Base shell ───────────────────────────────────────────────────────────────

/** One template for every email: blue header with logo and headline, white body, one quiet footer line. */
function base(heroHtml: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="x-apple-disable-message-reformatting"/>
  <meta name="color-scheme" content="light only"/>
  <title>CareerPath Africa</title>
</head>
<body style="margin:0;padding:0;background:#E9EDF5;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#E9EDF5;padding:32px 12px">
    <tr>
      <td align="center">
        <table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden">
          <tr>
            <td style="background:${BLUE};padding:24px 30px 28px;border-radius:8px 10px 0 0">
              ${logo()}
              ${heroHtml}
            </td>
          </tr>
          <tr>
            <td class="cpa-body" style="background:#ffffff;padding:26px 30px 24px;font-family:${FONT};font-size:15px;line-height:1.55;color:#3A4A70">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border-top:1px solid #E4E9F3;padding:14px 30px;border-radius:0 0 10px 10px">
              <p style="margin:0;font-size:12px;color:#97A2BD;font-family:${FONT}">
                CareerPath Africa &middot; <a href="${PORTAL_URL}/settings" style="color:#97A2BD;text-decoration:underline">Email settings</a> &middot; &copy; ${new Date().getFullYear()}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── 1. OTP Verification ──────────────────────────────────────────────────────

export function otpTemplate(code: string): string {
  const hero = headline('Your code', 'is here.');

  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#3A4A70;line-height:1.6;font-family:${FONT}">
      Use the code below to verify your email. It expires in <strong style="color:#072061">10 minutes</strong>.
    </p>

    <!-- OTP code block -->
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 28px">
      <tr>
        <td align="center">
          <table cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="background:#F0F4FF;border:2px solid #E6ECFD;border-radius:8px;padding:20px 36px;text-align:center">
                <span style="font-size:38px;font-weight:900;letter-spacing:12px;color:#072061;font-family:'Courier New',Courier,monospace">
                  ${code}
                </span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    ${divider()}

    <table cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td style="background:#F8FAFF;border:1px solid #E6ECFD;border-radius:8px;padding:14px 18px">
          <p style="margin:0;font-size:12px;color:#3A4A70;line-height:1.5;font-family:${FONT}">
            <strong style="color:#072061">Didn't request this?</strong>
            You can safely ignore this email. Your account is secure.
          </p>
        </td>
      </tr>
    </table>`;

  return base(hero, body);
}

// ── 2. Teacher Approved ──────────────────────────────────────────────────────

export function teacherApprovedTemplate(teacherNo?: string): string {
  const hero = headline('You’re in.', 'Welcome to the team.');

  const idBox = teacherNo ? `
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px">
      <tr>
        <td style="background:#F0F4FF;border:1.5px dashed #5889FA;border-radius:8px;padding:14px 18px">
          <p style="margin:0 0 3px;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#5889FA;font-family:${FONT}">Your Teacher ID</p>
          <p style="margin:0;font-size:20px;font-weight:900;color:#072061;font-family:'Courier New',Courier,monospace;letter-spacing:2px">${teacherNo}</p>
          <p style="margin:4px 0 0;font-size:11px;color:#3A4A70;opacity:0.7;font-family:${FONT}">Quote this ID in all support and billing queries.</p>
        </td>
      </tr>
    </table>` : '';

  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#3A4A70;line-height:1.6;font-family:${FONT}">
      Great news — your teacher application on <strong style="color:#072061">CareerPath Africa</strong> has been <strong style="color:#072061">approved</strong>. You can now log in and start making an impact.
    </p>
    ${idBox}

    <!-- Feature list -->
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:8px">
      ${[
        ['diploma', 'Manage cohorts', 'Create and enrol students into your cohorts'],
        ['video', 'Schedule live classes', 'Host live sessions with your Daily.co room'],
        ['docText', 'Grade assignments', 'Review and provide feedback on student work'],
      ].map(([iconKey, title, desc]) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #E6ECFD;vertical-align:middle;width:36px">
          <table cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="32" height="32" style="width:32px;height:32px;background:#EEF2FF;border-radius:8px;text-align:center;vertical-align:middle;padding:7px">
                ${icon(iconKey as keyof typeof SVG_PATHS, 18, '#5889FA')}
              </td>
            </tr>
          </table>
        </td>
        <td style="padding:10px 0 10px 14px;border-bottom:1px solid #E6ECFD;vertical-align:middle">
          <p style="margin:0 0 2px;font-size:13px;font-weight:700;color:#072061;font-family:${FONT}">${title}</p>
          <p style="margin:0;font-size:12px;color:#3A4A70;opacity:0.8;font-family:${FONT}">${desc}</p>
        </td>
      </tr>`).join('')}
    </table>

    ${ctaButton('Go to teacher dashboard', `${PORTAL_URL}/teacher/dashboard`)}

    ${divider()}
    <p style="margin:0;font-size:12px;color:#3A4A70;opacity:0.6;font-family:${FONT}">
      If you have any questions, reply to this email or visit our support centre.
    </p>`;

  return base(hero, body);
}

// ── 3. Teacher Rejected ──────────────────────────────────────────────────────

export function teacherRejectedTemplate(rejectionReason?: string): string {
  const hero = headline('Thank you', 'for applying.');

  const reasonBlock = rejectionReason ? `
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:20px 0">
      <tr>
        <td style="background:#F0F4FF;border-left:3px solid #5889FA;border-radius:0 10px 10px 0;padding:14px 18px">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#5889FA;font-family:${FONT}">Feedback from our team</p>
          <p style="margin:0;font-size:13px;color:#072061;line-height:1.5;font-family:${FONT}">${rejectionReason}</p>
        </td>
      </tr>
    </table>` : '';

  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#3A4A70;line-height:1.6;font-family:${FONT}">
      Thank you for applying to teach on <strong style="color:#072061">CareerPath Africa</strong>. After careful review, we are unable to approve your application at this time.
    </p>

    ${reasonBlock}

    <p style="margin:0 0 8px;font-size:14px;color:#3A4A70;line-height:1.6;font-family:${FONT}">
      We encourage you to strengthen your profile and reapply. Our team is happy to guide you on what to improve.
    </p>

    ${ctaButton('Contact support', 'mailto:support@careerpathafrica.com', '#405FAD')}

    ${divider()}
    <p style="margin:0;font-size:12px;color:#3A4A70;opacity:0.6;font-family:${FONT}">
      You can reapply at any time from <a href="${PORTAL_URL}/register" style="color:#5889FA;text-decoration:none">careerpathafrica.com</a>.
    </p>`;

  return base(hero, body);
}

// ── 4. Country Rep Assigned ──────────────────────────────────────────────────

export function repAssignedTemplate(countryName: string, currency: string): string {
  const hero = headline('Welcome to', `the team, ${escapeHtml(countryName)}.`);

  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#3A4A70;line-height:1.6;font-family:${FONT}">
      You have been appointed as the <strong style="color:#072061">Country Representative</strong> for <strong style="color:#072061">${countryName}</strong> on CareerPath Africa.
    </p>

    <!-- Stats row -->
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px">
      <tr>
        <td style="width:50%;padding-right:8px">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="background:#F0F4FF;border:1px solid #E6ECFD;border-radius:8px;padding:16px 18px;text-align:center">
                <p style="margin:0 0 4px;font-size:22px;font-weight:900;color:#072061;font-family:${FONT}">${countryName}</p>
                <p style="margin:0;font-size:11px;color:#3A4A70;opacity:0.7;font-family:${FONT};text-transform:uppercase;letter-spacing:0.08em">Your territory</p>
              </td>
            </tr>
          </table>
        </td>
        <td style="width:50%;padding-left:8px">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="background:#F0F4FF;border:1px solid #E6ECFD;border-radius:8px;padding:16px 18px;text-align:center">
                <p style="margin:0 0 4px;font-size:22px;font-weight:900;color:#5889FA;font-family:${FONT}">${currency}</p>
                <p style="margin:0;font-size:11px;color:#3A4A70;opacity:0.7;font-family:${FONT};text-transform:uppercase;letter-spacing:0.08em">Wallet currency</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 8px;font-size:14px;color:#3A4A70;line-height:1.6;font-family:${FONT}">
      You will earn a <strong style="color:#072061">commission</strong> for every student purchase from ${countryName}. Your earnings wallet is ready in <strong style="color:#072061">${currency}</strong>.
    </p>

    ${ctaButton('View your dashboard', `${PORTAL_URL}/country-rep/dashboard`)}

    ${divider()}
    <p style="margin:0;font-size:12px;color:#3A4A70;opacity:0.6;font-family:${FONT}">
      Questions about your role? Contact our partnership team at <a href="mailto:partnerships@careerpathafrica.com" style="color:#5889FA;text-decoration:none">partnerships@careerpathafrica.com</a>.
    </p>`;

  return base(hero, body);
}

// ── 5a. Welcome — Student ────────────────────────────────────────────────────

export function welcomeStudentTemplate(firstName: string, studentNo?: string): string {
  const name = firstName || 'there';
  const hero = headline('Welcome,', `${escapeHtml(name)}.`);

  const idBox = studentNo ? `
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px">
      <tr>
        <td style="background:#F0F4FF;border:1.5px dashed #5889FA;border-radius:8px;padding:14px 18px">
          <p style="margin:0 0 3px;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#5889FA;font-family:${FONT}">Your Student ID</p>
          <p style="margin:0;font-size:20px;font-weight:900;color:#072061;font-family:'Courier New',Courier,monospace;letter-spacing:2px">${studentNo}</p>
          <p style="margin:4px 0 0;font-size:11px;color:#3A4A70;opacity:0.7;font-family:${FONT}">Keep this for reference in all support queries.</p>
        </td>
      </tr>
    </table>` : '';

  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#3A4A70;line-height:1.6;font-family:${FONT}">
      Your <strong style="color:#072061">CareerPath Africa</strong> account is ready. Browse available packages and start learning at your own pace.
    </p>
    ${idBox}
    ${ctaButton('Explore packages', `${PORTAL_URL}/packages`)}
    ${divider()}
    <p style="margin:0;font-size:12px;color:#3A4A70;opacity:0.6;font-family:${FONT}">
      Need help getting started? Email us at <a href="mailto:support@careerpathafrica.com" style="color:#5889FA;text-decoration:none">support@careerpathafrica.com</a>.
    </p>`;

  return base(hero, body);
}

// ── 5b. Welcome — Teacher (pending review) ───────────────────────────────────

export function welcomeTeacherTemplate(firstName: string): string {
  const name = firstName || 'there';
  const hero = headline(`Thanks, ${escapeHtml(name)}.`, 'We’ve got it.');

  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#3A4A70;line-height:1.6;font-family:${FONT}">
      We've received your teacher application on <strong style="color:#072061">CareerPath Africa</strong>.
      Our team will review it and notify you by email — typically within 2–3 business days.
    </p>
    <table cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td style="background:#F8FAFF;border:1px solid #E6ECFD;border-radius:8px;padding:14px 18px">
          <p style="margin:0;font-size:12px;color:#3A4A70;line-height:1.5;font-family:${FONT}">
            <strong style="color:#072061">What happens next?</strong>
            Once approved, you'll receive a second email with a link to your teacher dashboard where you can create cohorts, schedule live classes, and upload course materials.
          </p>
        </td>
      </tr>
    </table>
    ${divider()}
    <p style="margin:0;font-size:12px;color:#3A4A70;opacity:0.6;font-family:${FONT}">
      Questions? Contact us at <a href="mailto:support@careerpathafrica.com" style="color:#5889FA;text-decoration:none">support@careerpathafrica.com</a>.
    </p>`;

  return base(hero, body);
}

// ── 5b. Admin announcement (broadcast) ───────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Title/body are typed by an admin, so they're escaped; line breaks are kept. */
export function announcementTemplate(title: string, message: string): string {
  const hero = headline(escapeHtml(title));

  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#3A4A70;line-height:1.6;font-family:${FONT}">
      ${escapeHtml(message).replace(/\n/g, '<br>')}
    </p>
    ${ctaButton('Open CareerPath Africa', PORTAL_URL)}`;

  return base(hero, body);
}

// ── 5b2. New message (only when the person isn't online) ─────────────────────

/** Sender name and message text are typed by users, so they're escaped. */
export function newMessageTemplate(fromName: string, preview: string, where: string | null, link: string): string {
  const hero = headline('New message', `from ${escapeHtml(fromName)}.`);

  const body = `
    <p style="margin:0 0 20px;padding:14px 16px;border-radius:8px;background:#F4F6FB;font-size:15px;color:#072061;line-height:1.6;font-family:${FONT}">
      ${escapeHtml(preview).replace(/\n/g, '<br>')}
    </p>
    ${ctaButton('Reply on CareerPath', link)}
    <p style="margin:16px 0 0;font-size:12px;color:#3A4A70;opacity:0.7;font-family:${FONT}">
      You get this email because you weren’t online. Turn message emails off in Settings → Notifications.
    </p>`;

  return base(hero, body);
}

// ── 5b3. School seat invitation and school admin welcome ─────────────────────

/** A school or company bought a seat for this email. Names are typed by admins, so they're escaped. */
export function orgSeatInviteTemplate(orgName: string, packageName: string, link: string, joinCode?: string | null): string {
  const hero = headline('A place is', 'waiting for you.');
  const codePart = joinCode ? `
    <p style="margin:18px 0 6px;font-size:13px;color:#637090;font-family:${FONT}">Or sign up on CareerPath Africa with the school code:</p>
    ${codeBox(escapeHtml(joinCode), 22)}` : '';
  const body = `
    <p style="margin:0 0 4px;font-size:15px;color:#3A4A70;line-height:1.6;font-family:${FONT}">
      <strong style="color:#072061">${escapeHtml(orgName)}</strong> paid for your place on <strong style="color:#072061">${escapeHtml(packageName)}</strong>. Create your account with this email address, then take your place.
    </p>
    ${ctaButton('Take my place', link)}${codePart}`;
  return base(hero, body);
}

export function orgAdminWelcomeTemplate(name: string, orgName: string, link: string): string {
  const hero = headline(escapeHtml(orgName), 'is set up.');
  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#3A4A70;line-height:1.6;font-family:${FONT}">
      You can now manage <strong style="color:#072061">${escapeHtml(orgName)}</strong>’s seats: invite students, share your join link and see how they’re doing. Sign in with this email — we send you a code each time, so there’s no password to remember.
    </p>
    ${ctaButton('Open the school portal', link)}`;
  return base(hero, body);
}

// ── 5c. Course Approved ──────────────────────────────────────────────────────

export function courseApprovedTemplate(courseTitle: string): string {
  const hero = headline('Your course', 'is live.');

  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#3A4A70;line-height:1.6;font-family:${FONT}">
      Great news — <strong style="color:#072061">${courseTitle}</strong> has been reviewed and approved. It is now published and visible to students.
    </p>
    ${ctaButton('View your courses', `${PORTAL_URL}/teacher/courses`)}
    ${divider()}
    <p style="margin:0;font-size:12px;color:#3A4A70;opacity:0.6;font-family:${FONT}">
      Commissions are credited to your wallet as students enrol. Check your earnings at any time from the <a href="${PORTAL_URL}/teacher/wallet" style="color:#5889FA;text-decoration:none">wallet page</a>.
    </p>`;

  return base(hero, body);
}

// ── 5d. Reviewer Assigned ────────────────────────────────────────────────────

export function reviewerAssignedTemplate(courseTitle: string): string {
  const hero = headline('A course is', 'waiting for you.');

  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#3A4A70;line-height:1.6;font-family:${FONT}">
      You've been assigned to review <strong style="color:#072061">${courseTitle}</strong> on CareerPath Africa.
      Please complete your review as soon as possible so the course can be published.
    </p>
    ${ctaButton('Go to review queue', `${PORTAL_URL}/reviewer/dashboard`)}
    ${divider()}
    <p style="margin:0;font-size:12px;color:#3A4A70;opacity:0.6;font-family:${FONT}">
      Your commission is credited once you submit your decision. Questions? Contact <a href="mailto:support@careerpathafrica.com" style="color:#5889FA;text-decoration:none">support@careerpathafrica.com</a>.
    </p>`;

  return base(hero, body);
}

// ── 5e. Payout Initiated ─────────────────────────────────────────────────────

export function payoutInitiatedTemplate(formattedAmount: string, currency: string, periodLabel: string): string {
  const hero = headline(`${formattedAmount} ${currency}`, 'is on its way.');

  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#3A4A70;line-height:1.6;font-family:${FONT}">
      A payout of <strong style="color:#072061">${formattedAmount} ${currency}</strong> for the period <strong style="color:#072061">${periodLabel}</strong> has been initiated and is being processed to your registered bank account.
    </p>
    <table cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td style="background:#F8FAFF;border:1px solid #E6ECFD;border-radius:8px;padding:14px 18px">
          <p style="margin:0;font-size:12px;color:#3A4A70;line-height:1.5;font-family:${FONT}">
            Bank transfers typically arrive within 1–3 business days. You'll receive another email once the payment is confirmed as received.
          </p>
        </td>
      </tr>
    </table>
    ${ctaButton('View payout history', `${PORTAL_URL}/teacher/wallet`)}
    ${divider()}
    <p style="margin:0;font-size:12px;color:#3A4A70;opacity:0.6;font-family:${FONT}">
      Issues? Contact <a href="mailto:billing@careerpathafrica.com" style="color:#5889FA;text-decoration:none">billing@careerpathafrica.com</a>.
    </p>`;

  return base(hero, body);
}

// ── 5f. Payout Completed ─────────────────────────────────────────────────────

export function payoutCompletedTemplate(formattedAmount: string, currency: string): string {
  const hero = headline('Paid.', `${formattedAmount} ${currency}.`);

  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#3A4A70;line-height:1.6;font-family:${FONT}">
      Your payout of <strong style="color:#072061">${formattedAmount} ${currency}</strong> has been confirmed as paid to your registered bank account.
    </p>
    ${ctaButton('View wallet', `${PORTAL_URL}/teacher/wallet`)}
    ${divider()}
    <p style="margin:0;font-size:12px;color:#3A4A70;opacity:0.6;font-family:${FONT}">
      Questions about this payment? Email <a href="mailto:billing@careerpathafrica.com" style="color:#5889FA;text-decoration:none">billing@careerpathafrica.com</a>.
    </p>`;

  return base(hero, body);
}

// ── 5g. Package Expiry Warning ───────────────────────────────────────────────

export function expiryWarningTemplate(packageName: string, daysLeft: number, expiresOn: string): string {
  const hero = headline(daysLeft === 1 ? 'One day' : `${daysLeft} days`, 'left.');

  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#3A4A70;line-height:1.6;font-family:${FONT}">
      Your access to <strong style="color:#072061">${packageName}</strong> expires on <strong style="color:#072061">${expiresOn}</strong>.
      Renew now to keep uninterrupted access to all course materials and live sessions.
    </p>
    ${ctaButton('Renew access', `${PORTAL_URL}/packages`)}
    ${divider()}
    <p style="margin:0;font-size:12px;color:#3A4A70;opacity:0.6;font-family:${FONT}">
      Need help? Contact <a href="mailto:support@careerpathafrica.com" style="color:#5889FA;text-decoration:none">support@careerpathafrica.com</a>.
    </p>`;

  return base(hero, body);
}

// ── 5h. Weekly Earnings Digest (Teacher / Country Rep) ───────────────────────

export function weeklyEarningsDigestTemplate(opts: {
  firstName: string;
  role: 'teacher' | 'country-rep';
  weekLabel: string;
  totalEarned: string;
  currency: string;
  newItems: number;    // courses sold (teacher) | new students (rep)
  pendingPayout: string;
  dashboardPath: string;
}): string {
  const roleLabel = opts.role === 'teacher' ? 'teacher' : 'country rep';
  const itemLabel = opts.role === 'teacher' ? 'course sale' : 'new student';
  const plural = opts.newItems !== 1 ? 's' : '';

  const hero = headline('This week', `you earned ${opts.totalEarned} ${opts.currency}.`);

  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#3A4A70;line-height:1.6;font-family:${FONT}">
      Here's a snapshot of your ${roleLabel} activity for the week of <strong style="color:#072061">${opts.weekLabel}</strong>.
    </p>

    <!-- Stats grid -->
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px">
      <tr>
        ${[
          { label: 'Earned this week', value: `${opts.currency} ${opts.totalEarned}` },
          { label: `${itemLabel.charAt(0).toUpperCase() + itemLabel.slice(1)}${plural}`, value: String(opts.newItems) },
          { label: 'Pending payout', value: `${opts.currency} ${opts.pendingPayout}` },
        ].map(s => `
        <td style="width:33%;padding-right:8px">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="background:#F0F4FF;border:1px solid #E6ECFD;border-radius:8px;padding:14px 16px;text-align:center">
                <p style="margin:0 0 4px;font-size:18px;font-weight:900;color:#072061;font-family:${FONT}">${s.value}</p>
                <p style="margin:0;font-size:10px;color:#3A4A70;opacity:0.7;font-family:${FONT};text-transform:uppercase;letter-spacing:0.08em">${s.label}</p>
              </td>
            </tr>
          </table>
        </td>`).join('')}
      </tr>
    </table>

    ${ctaButton('View full dashboard', `${PORTAL_URL}${opts.dashboardPath}`)}
    ${divider()}
    <p style="margin:0;font-size:11px;color:#3A4A70;opacity:0.5;font-family:${FONT}">
      This digest is sent every Monday. Contact <a href="mailto:support@careerpathafrica.com" style="color:#5889FA;text-decoration:none">support@careerpathafrica.com</a> to unsubscribe.
    </p>`;

  return base(hero, body);
}

// ── 5i. Daily Admin Digest ───────────────────────────────────────────────────

export function dailyAdminDigestTemplate(opts: {
  date: string;
  newSignups: number;
  newPurchases: number;
  pendingTeachers: number;
  pendingPayouts: number;
  failedWebhooks: number;
}): string {
  const hero = headline('Today', 'on CareerPath.');

  const stats = [
    { label: 'New signups',        value: opts.newSignups },
    { label: 'Purchases',          value: opts.newPurchases },
    { label: 'Pending teachers',   value: opts.pendingTeachers },
    { label: 'Pending payouts',    value: opts.pendingPayouts },
    { label: 'Webhook failures',   value: opts.failedWebhooks },
  ];

  const rows = stats.map(s => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #E6ECFD;font-size:13px;color:#3A4A70;font-family:${FONT}">${s.label}</td>
      <td style="padding:10px 0;border-bottom:1px solid #E6ECFD;font-size:13px;font-weight:700;color:${s.value > 0 && (s.label.includes('fail') || s.label.includes('Pending')) ? '#d63638' : '#072061'};text-align:right;font-family:${FONT}">${s.value}</td>
    </tr>`).join('');

  const body = `
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px">
      ${rows}
    </table>
    ${ctaButton('Open admin dashboard', `${PORTAL_URL}/admin/dashboard`)}
    ${divider()}
    <p style="margin:0;font-size:11px;color:#3A4A70;opacity:0.5;font-family:${FONT}">
      Automated daily digest. Sent at 07:00 UTC.
    </p>`;

  return base(hero, body);
}

// ── 5. Purchase Receipt ──────────────────────────────────────────────────────

export function purchaseReceiptTemplate(
  itemName: string,
  formattedAmount: string,
  currency: string,
  invoiceNo?: string,
  studentName?: string,
  purchaseDate?: string,
  itemType: 'package' | 'course' = 'package',
): string {
  const dateStr = purchaseDate ?? new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const hero = headline('Paid.', 'Thank you.');

  const rows = [
    studentName ? `
      <tr>
        <td style="padding:14px 0;border-bottom:1px solid #E6ECFD;font-size:13px;color:#3A4A70;font-family:${FONT}">Billed to</td>
        <td style="padding:14px 0;border-bottom:1px solid #E6ECFD;font-size:13px;font-weight:700;color:#072061;text-align:right;font-family:${FONT}">${studentName}</td>
      </tr>` : '',
    `<tr>
        <td style="padding:14px 0;border-bottom:1px solid #E6ECFD;font-size:13px;color:#3A4A70;font-family:${FONT}">Date</td>
        <td style="padding:14px 0;border-bottom:1px solid #E6ECFD;font-size:13px;font-weight:700;color:#072061;text-align:right;font-family:${FONT}">${dateStr}</td>
      </tr>`,
    `<tr>
        <td style="padding:14px 0;border-bottom:1px solid #E6ECFD;font-size:13px;color:#3A4A70;font-family:${FONT}">${itemType === 'course' ? 'Course' : 'Package'}</td>
        <td style="padding:14px 0;border-bottom:1px solid #E6ECFD;font-size:13px;font-weight:700;color:#072061;text-align:right;font-family:${FONT}">${itemName}</td>
      </tr>`,
    `<tr>
        <td style="padding:14px 0;border-bottom:1px solid #E6ECFD;font-size:13px;color:#3A4A70;font-family:${FONT}">Currency</td>
        <td style="padding:14px 0;border-bottom:1px solid #E6ECFD;font-size:13px;font-weight:700;color:#072061;text-align:right;font-family:${FONT}">${currency}</td>
      </tr>`,
    `<tr>
        <td style="padding:16px 0;font-size:14px;font-weight:700;color:#072061;font-family:${FONT}">Total paid</td>
        <td style="padding:16px 0;font-size:20px;font-weight:900;color:#5889FA;text-align:right;font-family:${FONT}">${formattedAmount}</td>
      </tr>`,
  ].join('');

  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#3A4A70;line-height:1.6;font-family:${FONT}">
      Thank you for your purchase! Here's a summary of your transaction.
    </p>

    <!-- Receipt card -->
    <table cellpadding="0" cellspacing="0" border="0" width="100%"
           style="border:2px solid #E6ECFD;border-radius:8px;overflow:hidden;margin-bottom:8px">
      <tr>
        <td style="background:#072061;padding:12px 20px">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.6);font-family:${FONT}">
            Receipt · CareerPath Africa${invoiceNo ? ` · ${invoiceNo}` : ''}
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 20px">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            ${rows}
          </table>
        </td>
      </tr>
    </table>

    ${ctaButton('Access your courses', `${PORTAL_URL}/student/courses`)}

    ${divider()}
    <p style="margin:0;font-size:12px;color:#3A4A70;opacity:0.6;font-family:${FONT}">
      Receipts are also available in your <a href="${PORTAL_URL}/student/billing" style="color:#5889FA;text-decoration:none">billing history</a>. Need help? Contact <a href="mailto:billing@careerpathafrica.com" style="color:#5889FA;text-decoration:none">billing@careerpathafrica.com</a>.
    </p>`;

  return base(hero, body);
}

// ── 6. Mentorship Booking — Student ─────────────────────────────────────────

export function mentorshipBookingStudentTemplate(opts: {
  studentName: string;
  teacherName: string;
  dateStr: string;
  timeStr: string;
  durationMins: number;
  meetingUrl: string;
  bookingId: string;
}): string {
  const hero = headline('Booked with', `${escapeHtml(opts.teacherName)}.`);

  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#3A4A70;line-height:1.6;font-family:${FONT}">
      Hi <strong style="color:#072061">${opts.studentName}</strong>, your session with <strong style="color:#072061">${opts.teacherName}</strong> is confirmed.
    </p>

    <!-- Session details card -->
    <table cellpadding="0" cellspacing="0" border="0" width="100%"
           style="border:2px solid #E6ECFD;border-radius:8px;overflow:hidden;margin-bottom:24px">
      <tr>
        <td style="background:#072061;padding:12px 20px">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.6);font-family:${FONT}">
            Session Details
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 20px">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="padding:14px 0;border-bottom:1px solid #E6ECFD;font-size:13px;color:#3A4A70;font-family:${FONT}">Mentor</td>
              <td style="padding:14px 0;border-bottom:1px solid #E6ECFD;font-size:13px;font-weight:700;color:#072061;text-align:right;font-family:${FONT}">${opts.teacherName}</td>
            </tr>
            <tr>
              <td style="padding:14px 0;border-bottom:1px solid #E6ECFD;font-size:13px;color:#3A4A70;font-family:${FONT}">Date</td>
              <td style="padding:14px 0;border-bottom:1px solid #E6ECFD;font-size:13px;font-weight:700;color:#072061;text-align:right;font-family:${FONT}">${opts.dateStr}</td>
            </tr>
            <tr>
              <td style="padding:14px 0;border-bottom:1px solid #E6ECFD;font-size:13px;color:#3A4A70;font-family:${FONT}">Time</td>
              <td style="padding:14px 0;border-bottom:1px solid #E6ECFD;font-size:13px;font-weight:700;color:#072061;text-align:right;font-family:${FONT}">${opts.timeStr} UTC</td>
            </tr>
            <tr>
              <td style="padding:14px 0;font-size:13px;color:#3A4A70;font-family:${FONT}">Duration</td>
              <td style="padding:14px 0;font-size:13px;font-weight:700;color:#072061;text-align:right;font-family:${FONT}">${opts.durationMins} minutes</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    ${ctaButton('Join session', opts.meetingUrl)}

    ${divider()}
    <p style="margin:0;font-size:12px;color:#3A4A70;opacity:0.6;font-family:${FONT}">
      You can also access this from your <a href="${PORTAL_URL}/student/mentorship" style="color:#5889FA;text-decoration:none">mentorship page</a>. If you need to cancel, please do so at least 24 hours in advance.
    </p>`;

  return base(hero, body);
}

// ── 7. Mentorship Booking — Teacher ──────────────────────────────────────────

export function mentorshipBookingTeacherTemplate(opts: {
  teacherName: string;
  studentName: string;
  dateStr: string;
  timeStr: string;
  durationMins: number;
  meetingUrl: string;
  notes?: string;
}): string {
  const hero = headline(`${escapeHtml(opts.studentName)} booked`, 'a session.');

  const notesBlock = opts.notes ? `
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px">
      <tr>
        <td style="background:#F0F4FF;border-left:3px solid #5889FA;border-radius:0 10px 10px 0;padding:14px 18px">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#5889FA;font-family:${FONT}">Student notes</p>
          <p style="margin:0;font-size:13px;color:#072061;line-height:1.5;font-family:${FONT}">${opts.notes}</p>
        </td>
      </tr>
    </table>` : '';

  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#3A4A70;line-height:1.6;font-family:${FONT}">
      Hi <strong style="color:#072061">${opts.teacherName}</strong>, <strong style="color:#072061">${opts.studentName}</strong> has booked a session with you.
    </p>

    <table cellpadding="0" cellspacing="0" border="0" width="100%"
           style="border:2px solid #E6ECFD;border-radius:8px;overflow:hidden;margin-bottom:20px">
      <tr>
        <td style="background:#072061;padding:12px 20px">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.6);font-family:${FONT}">
            Session Details
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 20px">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="padding:14px 0;border-bottom:1px solid #E6ECFD;font-size:13px;color:#3A4A70;font-family:${FONT}">Student</td>
              <td style="padding:14px 0;border-bottom:1px solid #E6ECFD;font-size:13px;font-weight:700;color:#072061;text-align:right;font-family:${FONT}">${opts.studentName}</td>
            </tr>
            <tr>
              <td style="padding:14px 0;border-bottom:1px solid #E6ECFD;font-size:13px;color:#3A4A70;font-family:${FONT}">Date</td>
              <td style="padding:14px 0;border-bottom:1px solid #E6ECFD;font-size:13px;font-weight:700;color:#072061;text-align:right;font-family:${FONT}">${opts.dateStr}</td>
            </tr>
            <tr>
              <td style="padding:14px 0;border-bottom:1px solid #E6ECFD;font-size:13px;color:#3A4A70;font-family:${FONT}">Time</td>
              <td style="padding:14px 0;border-bottom:1px solid #E6ECFD;font-size:13px;font-weight:700;color:#072061;text-align:right;font-family:${FONT}">${opts.timeStr} UTC</td>
            </tr>
            <tr>
              <td style="padding:14px 0;font-size:13px;color:#3A4A70;font-family:${FONT}">Duration</td>
              <td style="padding:14px 0;font-size:13px;font-weight:700;color:#072061;text-align:right;font-family:${FONT}">${opts.durationMins} minutes</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    ${notesBlock}
    ${ctaButton('View in dashboard', `${PORTAL_URL}/teacher/mentorship`)}
    ${divider()}
    <p style="margin:0;font-size:12px;color:#3A4A70;opacity:0.6;font-family:${FONT}">
      Your meeting room will open automatically at session time. Manage all bookings from your <a href="${PORTAL_URL}/teacher/mentorship" style="color:#5889FA;text-decoration:none">mentorship page</a>.
    </p>`;

  return base(hero, body);
}

// ── 8. Mentorship Cancellation ───────────────────────────────────────────────

export function mentorshipCancellationTemplate(
  name: string,
  otherPartyName: string,
  dateStr: string,
  timeStr: string,
  cancelledByRole: 'student' | 'teacher',
): string {
  const cancelledBy = cancelledByRole === 'student' ? 'the student' : 'the teacher';
  const hero = headline('Session', 'cancelled.');

  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#3A4A70;line-height:1.6;font-family:${FONT}">
      Hi <strong style="color:#072061">${name}</strong>, your session with <strong style="color:#072061">${otherPartyName}</strong> scheduled for <strong style="color:#072061">${dateStr} at ${timeStr} UTC</strong> has been cancelled by ${cancelledBy}.
    </p>
    <table cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td style="background:#FFF8F0;border:1px solid #FDDCB5;border-radius:8px;padding:14px 18px">
          <p style="margin:0;font-size:12px;color:#92400E;line-height:1.5;font-family:${FONT}">
            <strong>What now?</strong> Browse available slots and book a new session at your convenience.
          </p>
        </td>
      </tr>
    </table>
    ${ctaButton('Find available sessions', `${PORTAL_URL}/student/mentorship`, '#405FAD')}
    ${divider()}
    <p style="margin:0;font-size:12px;color:#3A4A70;opacity:0.6;font-family:${FONT}">
      Questions? Contact <a href="mailto:support@careerpathafrica.com" style="color:#5889FA;text-decoration:none">support@careerpathafrica.com</a>.
    </p>`;

  return base(hero, body);
}

// ── 9. Assignment Graded ─────────────────────────────────────────────────────

export function assignmentGradedTemplate(opts: {
  studentName: string;
  assignmentTitle: string;
  courseTitle: string;
  grade: number;
  maxPoints: number;
  feedback?: string;
}): string {
  const pct = Math.round((opts.grade / opts.maxPoints) * 100);
  const passed = pct >= 50;
  const gradeColor = pct >= 70 ? '#059669' : pct >= 50 ? '#D97706' : '#DC2626';

  const hero = headline('Marked:', `${opts.grade} out of ${opts.maxPoints}.`);

  const feedbackBlock = opts.feedback ? `
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:16px 0">
      <tr>
        <td style="background:#F0F4FF;border-left:3px solid #5889FA;border-radius:0 10px 10px 0;padding:14px 18px">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#5889FA;font-family:${FONT}">Teacher feedback</p>
          <p style="margin:0;font-size:13px;color:#072061;line-height:1.6;font-family:${FONT}">${opts.feedback}</p>
        </td>
      </tr>
    </table>` : '';

  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#3A4A70;line-height:1.6;font-family:${FONT}">
      Hi <strong style="color:#072061">${opts.studentName}</strong>, your teacher has graded your submission for <strong style="color:#072061">${opts.assignmentTitle}</strong> in <strong style="color:#072061">${opts.courseTitle}</strong>.
    </p>

    <!-- Score display -->
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:8px">
      <tr>
        <td align="center">
          <table cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="background:#F0F4FF;border:2px solid #E6ECFD;border-radius:8px;padding:20px 36px;text-align:center">
                <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#3A4A70;font-family:${FONT}">Your score</p>
                <p style="margin:0;font-size:42px;font-weight:900;color:${gradeColor};font-family:${FONT};line-height:1">${opts.grade}<span style="font-size:22px;color:#3A4A70">/${opts.maxPoints}</span></p>
                <p style="margin:4px 0 0;font-size:14px;font-weight:700;color:${gradeColor};font-family:${FONT}">${pct}% — ${passed ? 'Passed' : 'Needs improvement'}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    ${feedbackBlock}
    ${ctaButton('View your assignments', `${PORTAL_URL}/student/assignments`)}
    ${divider()}
    <p style="margin:0;font-size:12px;color:#3A4A70;opacity:0.6;font-family:${FONT}">
      Keep it up — consistent effort is how you improve. Visit your <a href="${PORTAL_URL}/student/dashboard" style="color:#5889FA;text-decoration:none">dashboard</a> for more resources.
    </p>`;

  return base(hero, body);
}

// ── 10. Certificate Earned ───────────────────────────────────────────────────

export function certificateEarnedTemplate(
  studentName: string,
  courseTitle: string,
  verifyUrl: string,
): string {
  const hero = headline('Certified.', `Well done, ${escapeHtml(studentName)}.`);

  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#3A4A70;line-height:1.6;font-family:${FONT}">
      You've successfully completed <strong style="color:#072061">${courseTitle}</strong> and earned your CareerPath Africa certificate. This is a significant achievement — well done!
    </p>

    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:8px">
      <tr>
        <td style="background:#F0F4FF;border:1.5px dashed #5889FA;border-radius:8px;padding:18px 20px;text-align:center">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#5889FA;font-family:${FONT}">Verification URL</p>
          <a href="${verifyUrl}" style="font-size:13px;color:#072061;font-family:'Courier New',Courier,monospace;word-break:break-all;text-decoration:none">${verifyUrl}</a>
          <p style="margin:6px 0 0;font-size:11px;color:#3A4A70;opacity:0.7;font-family:${FONT}">Share this link with employers to verify your certificate.</p>
        </td>
      </tr>
    </table>

    ${ctaButton('View your certificate', `${PORTAL_URL}/student/certificates`)}

    ${divider()}
    <p style="margin:0;font-size:12px;color:#3A4A70;opacity:0.6;font-family:${FONT}">
      Share this achievement on LinkedIn and let your network know. You've earned it!
    </p>`;

  return base(hero, body);
}

// ── 11. Live Session Reminder ────────────────────────────────────────────────

export function liveSessionReminderTemplate(
  name: string,
  courseTitle: string,
  startTimeStr: string,
  roomUrl: string,
  minutesBefore: number,
): string {
  const urgency = minutesBefore <= 15 ? 'Starting now!' : `Starting in ${minutesBefore} minutes`;
  const hero = headline('Class starts', minutesBefore <= 15 ? 'now.' : `in ${minutesBefore} minutes.`);

  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#3A4A70;line-height:1.6;font-family:${FONT}">
      Hi <strong style="color:#072061">${name}</strong>, your live class for <strong style="color:#072061">${courseTitle}</strong> starts at <strong style="color:#072061">${startTimeStr} UTC</strong>.
    </p>
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:8px">
      <tr>
        <td style="background:#F8FAFF;border:1px solid #E6ECFD;border-radius:8px;padding:14px 18px">
          <p style="margin:0;font-size:12px;color:#3A4A70;line-height:1.5;font-family:${FONT}">
            Make sure your camera and microphone are working before you join. Join a few minutes early if you can.
          </p>
        </td>
      </tr>
    </table>
    ${ctaButton('Join live class', roomUrl)}
    ${divider()}
    <p style="margin:0;font-size:12px;color:#3A4A70;opacity:0.6;font-family:${FONT}">
      View all your upcoming sessions from your <a href="${PORTAL_URL}/student/live" style="color:#5889FA;text-decoration:none">live sessions page</a>.
    </p>`;

  return base(hero, body);
}

// ── Password reset (our own, no longer WordPress) ───────────────────────────

export function passwordResetTemplate(firstName: string, link: string): string {
  const hero = headline('A new password,', 'in one step.');
  const body = `
    <p style="margin:0;font-size:15px;color:#3A4A70;line-height:1.6;font-family:${FONT}">
      Hi ${escapeHtml(firstName || 'there')}, someone asked to reset the password for this email. If it was you, choose a new one below. The link works for 30 minutes, once.
    </p>
    ${ctaButton('Choose a new password', link)}
    <p style="margin:10px 0 0;font-size:13px;color:#637090;font-family:${FONT}">Didn’t ask for this? Ignore it; your password stays the same.</p>`;
  return base(hero, body);
}

export function adminCodeTemplate(code: string): string {
  const hero = headline('Your admin', 'sign-in code.');
  const body = `
    <p style="margin:0 0 6px;font-size:15px;color:#3A4A70;line-height:1.6;font-family:${FONT}">Type this code to finish signing in to the admin portal. It works for 10 minutes.</p>
    ${codeBox(code)}
    <p style="margin:0;font-size:13px;color:#637090;font-family:${FONT}">Didn’t just sign in? Someone has your password: change it now in Settings.</p>`;
  return base(hero, body);
}

// ── Mock exam marked by a teacher ────────────────────────────────────────────

export function mockMarkedTemplate(opts: {
  firstName: string;
  teacherName: string;
  examTitle: string;
  percent: number;
  passMark: number;
  link: string;
}): string {
  const passed = opts.percent >= opts.passMark;
  const hero = headline('Your result', 'is ready.');
  const body = `
    <p style="margin:0;font-size:15px;color:#3A4A70;line-height:1.6;font-family:${FONT}">
      Hi ${escapeHtml(opts.firstName || 'there')}, ${escapeHtml(opts.teacherName)} marked the written answers in <strong style="color:#072061">${escapeHtml(opts.examTitle)}</strong>.
      You scored <strong style="color:#072061">${opts.percent}%</strong>, ${passed ? 'above' : 'below'} the ${opts.passMark}% pass mark.
    </p>
    ${ctaButton('See my result', opts.link)}
    <p style="margin:10px 0 0;font-size:13px;color:#637090;font-family:${FONT}">Review every answer and practise what you got wrong.</p>`;
  return base(hero, body);
}
