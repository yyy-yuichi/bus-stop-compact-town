// Extract only explicit place coordinates, never the map viewport centre.
export function placePosition(url, receipt) {
  if (receipt.error) return null;
  if (url.includes('/maps/embed?')) {
    const cid = decodeURIComponent(url).match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/)?.[1];
    if (!cid) return null;
    const escaped = cid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = receipt.html?.match(new RegExp('\\["' + escaped + '","((?:[^"\\\\]|\\\\.)*)",\\[(-?\\d+\\.\\d+),(-?\\d+\\.\\d+)\\]'));
    return m ? {name: JSON.parse('"' + m[1] + '"'), coordinates: [Number(m[3]), Number(m[2])], method: 'named_embed_place_record'} : null;
  }
  const m = receipt.final_url?.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  return m ? {name: decodeURIComponent(receipt.final_url.match(/\/place\/([^/]+)/)?.[1] ?? '').replaceAll('+', ' '), coordinates: [Number(m[2]), Number(m[1])], method: 'place_url_data_not_viewport'} : null;
}

// Preserve nested evidence in CSV rather than turning objects into [object Object].
export function evidenceCsv(rows, fields) {
  const cell = value => {
    let text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return '\ufeff' + [fields, ...rows.map(row => fields.map(field => row[field]))].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
