/** PptxGenJS 4 can repeat paragraph properties between highlighted text runs.
 * OOXML allows one pPr, before runs. Keep its paragraph formatting and every run.
 */
export function repairDrawingParagraphs(xml: string): string {
  return xml.replace(/<a:p(\s[^>]*)?>([\s\S]*?)<\/a:p>/g, (_paragraph, attributes, body: string) => {
    let properties = '';
    const runs = body.replace(/<a:pPr\b[^>]*(?:\/>|>[\s\S]*?<\/a:pPr>)/g, (node) => {
      if (!properties) properties = node;
      return '';
    });
    return `<a:p${attributes || ''}>${properties}${runs}</a:p>`;
  });
}
