const ALLOWED_TAGS = new Set([
  'b',
  'strong',
  'i',
  'em',
  'u',
  'p',
  'br',
  'ul',
  'ol',
  'li',
  'code',
  'pre',
  'blockquote',
  'span',
]);

const ALLOWED_ATTRIBUTES = new Set(['class', 'title']);

function removeDangerousProtocol(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '');
  if (
    normalized.startsWith('javascript:') ||
    normalized.startsWith('data:text/html') ||
    normalized.startsWith('vbscript:')
  ) {
    return '#';
  }
  return value;
}

function sanitizeElement(element: Element): void {
  const tagName = element.tagName.toLowerCase();

  if (!ALLOWED_TAGS.has(tagName)) {
    const textNode = document.createTextNode(element.textContent ?? '');
    element.replaceWith(textNode);
    return;
  }

  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase();
    const value = attribute.value;
    const isEventHandler = name.startsWith('on');
    const isDangerousStyle = name === 'style';
    const isSrcDoc = name === 'srcdoc';
    const isHrefOrSrc = name === 'href' || name === 'src';

    if (isEventHandler || isDangerousStyle || isSrcDoc) {
      element.removeAttribute(attribute.name);
      continue;
    }

    if (isHrefOrSrc) {
      element.setAttribute(attribute.name, removeDangerousProtocol(value));
      continue;
    }

    if (!ALLOWED_ATTRIBUTES.has(name)) {
      element.removeAttribute(attribute.name);
    }
  }
}

/**
 * Làm sạch HTML đầu ra từ AI bằng allowlist thẻ và thuộc tính an toàn (FE-NEG-01, FE-NEG-02).
 */
export function sanitizeHtml(rawHtml: string): string {
  const template = document.createElement('template');
  template.innerHTML = rawHtml;

  const dangerousNodes = template.content.querySelectorAll(
    'script, iframe, object, embed, link, meta, style',
  );
  dangerousNodes.forEach((node) => node.remove());

  const elements = template.content.querySelectorAll('*');
  elements.forEach((element) => sanitizeElement(element));

  return template.innerHTML;
}

/**
 * Loại bỏ hoàn toàn thẻ HTML và các thẻ thực thi nguy hiểm, chỉ giữ lại văn bản thuần an toàn.
 */
export function stripAllHtml(rawValue: string): string {
  const template = document.createElement('template');
  template.innerHTML = rawValue;
  const dangerousNodes = template.content.querySelectorAll(
    'script, iframe, object, embed, link, meta, style',
  );
  dangerousNodes.forEach((node) => node.remove());
  return template.content.textContent ?? '';
}
