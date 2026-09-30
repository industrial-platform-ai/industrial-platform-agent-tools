import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

function cleanText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function extractPdf(buffer, { maxPages = 200, maxTextChars = 500_000 } = {}) {
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false
  });

  const doc = await loadingTask.promise;
  const info = await doc.getMetadata().catch(() => ({ info: {}, metadata: null }));

  const pageCount = Math.min(doc.numPages, maxPages);
  const pages = [];
  let totalText = '';
  let truncated = false;

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();

    const pageText = cleanText(
      content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
    );

    let retained = pageText;
    const remaining = maxTextChars - totalText.length - (totalText ? 2 : 0);

    if (remaining <= 0) {
      retained = '';
      truncated = true;
    } else if (retained.length > remaining) {
      retained = retained.slice(0, remaining);
      truncated = true;
    }

    pages.push({
      page_number: pageNumber,
      text: retained,
      text_length: pageText.length
    });

    if (retained) {
      totalText += (totalText ? '\n\n' : '') + retained;
    }

    if (truncated) break;
  }

  if (doc.numPages > maxPages) truncated = true;

  const metadata = info?.info ?? {};

  return {
    page_count: doc.numPages,
    extracted_pages: pages.length,
    title: metadata.Title || undefined,
    author: metadata.Author || undefined,
    subject: metadata.Subject || undefined,
    creator: metadata.Creator || undefined,
    producer: metadata.Producer || undefined,
    creation_date: metadata.CreationDate || undefined,
    modification_date: metadata.ModDate || undefined,
    text: totalText,
    text_length: totalText.length,
    text_truncated: truncated,
    pages
  };
}
