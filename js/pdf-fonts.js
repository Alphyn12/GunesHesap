export const PDF_FONT_FAMILY = 'SolarRotaPdfFont';

const FONT_FILES = {
  normal: {
    filename: 'LiberationSans-Regular.ttf',
    path: 'assets/fonts/LiberationSans-Regular.ttf'
  },
  bold: {
    filename: 'LiberationSans-Bold.ttf',
    path: 'assets/fonts/LiberationSans-Bold.ttf'
  }
};

const fontBase64Cache = new Map();

function loadFontBase64(path) {
  if (fontBase64Cache.has(path)) return fontBase64Cache.get(path);
  if (typeof XMLHttpRequest === 'undefined' || typeof btoa === 'undefined') return null;
  try {
    const request = new XMLHttpRequest();
    request.open('GET', path, false);
    if (typeof request.overrideMimeType === 'function') {
      request.overrideMimeType('text/plain; charset=x-user-defined');
    }
    request.send(null);
    if (request.status && request.status !== 200) return null;
    if (!request.responseText) return null;
    let binary = '';
    for (let i = 0; i < request.responseText.length; i += 1) {
      binary += String.fromCharCode(request.responseText.charCodeAt(i) & 0xff);
    }
    const base64 = btoa(binary);
    fontBase64Cache.set(path, base64);
    return base64;
  } catch (error) {
    console.warn('[PDF] Unicode font could not be loaded:', error);
    return null;
  }
}

export function registerPdfFonts(doc) {
  if (!doc || typeof doc.addFileToVFS !== 'function' || typeof doc.addFont !== 'function') return false;
  try {
    const regular = loadFontBase64(FONT_FILES.normal.path);
    if (!regular) return false;
    doc.addFileToVFS(FONT_FILES.normal.filename, regular);
    doc.addFont(FONT_FILES.normal.filename, PDF_FONT_FAMILY, 'normal');

    const bold = loadFontBase64(FONT_FILES.bold.path);
    if (bold) {
      doc.addFileToVFS(FONT_FILES.bold.filename, bold);
      doc.addFont(FONT_FILES.bold.filename, PDF_FONT_FAMILY, 'bold');
    }

    doc.setFont(PDF_FONT_FAMILY, 'normal');
    return true;
  } catch (error) {
    console.warn('[PDF] Unicode font registration failed:', error);
    return false;
  }
}

function resolveSolarRotaLogoElement() {
  if (typeof document === 'undefined') return null;
  const candidates = [
    'img.logo-icon[src*="new_version_logo"]',
    '.lp-nav-brand img[src*="new_version_logo"]',
    'img[src*="new_version_logo.png"]'
  ];
  for (const selector of candidates) {
    const image = document.querySelector(selector);
    if (image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0) return image;
  }
  return null;
}

function imageToDataUrl(image) {
  if (typeof document === 'undefined' || !image) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const context = canvas.getContext('2d');
    if (!context || !canvas.width || !canvas.height) return null;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } catch (error) {
    console.warn('[PDF] Logo could not be converted to a data URL:', error);
    return null;
  }
}

export function addSolarRotaLogo(doc, { x, y, width, height } = {}) {
  if (!doc || typeof doc.addImage !== 'function') return false;
  const image = resolveSolarRotaLogoElement();
  if (!image) return false;
  try {
    doc.addImage(image, 'PNG', x, y, width, height, undefined, 'FAST');
    return true;
  } catch (firstError) {
    try {
      const dataUrl = imageToDataUrl(image);
      if (!dataUrl) throw firstError;
      doc.addImage(dataUrl, 'PNG', x, y, width, height, undefined, 'FAST');
      return true;
    } catch (secondError) {
      console.warn('[PDF] Logo could not be added, falling back to text branding:', secondError);
      return false;
    }
  }
}
