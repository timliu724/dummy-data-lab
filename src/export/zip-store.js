const encoder = new TextEncoder();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function bytesFrom(content) {
  if (content instanceof Uint8Array) return content;
  return encoder.encode(String(content));
}

function concat(chunks) {
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}

function record(length, write) {
  const bytes = new Uint8Array(length);
  write(new DataView(bytes.buffer));
  return bytes;
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

export function createStoreZip(files, { date = new Date() } = {}) {
  if (!Array.isArray(files) || files.length === 0) throw new RangeError('A ZIP archive needs at least one file.');
  const names = new Set();
  const localChunks = [];
  const centralChunks = [];
  let localOffset = 0;
  const stamp = dosDateTime(date);
  for (const file of files) {
    const name = String(file.name ?? '').replaceAll('\\', '/').replace(/^\/+/, '');
    if (!name || name.includes('../') || names.has(name)) throw new RangeError(`ZIP entry name is missing, unsafe, or duplicated: ${name || '(empty)'}.`);
    names.add(name);
    const nameBytes = encoder.encode(name);
    const data = bytesFrom(file.content);
    const checksum = crc32(data);
    const localHeader = record(30, (view) => {
      view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x0800, true);
      view.setUint16(8, 0, true); view.setUint16(10, stamp.time, true); view.setUint16(12, stamp.date, true);
      view.setUint32(14, checksum, true); view.setUint32(18, data.length, true); view.setUint32(22, data.length, true);
      view.setUint16(26, nameBytes.length, true); view.setUint16(28, 0, true);
    });
    localChunks.push(localHeader, nameBytes, data);
    const centralHeader = record(46, (view) => {
      view.setUint32(0, 0x02014b50, true); view.setUint16(4, 20, true); view.setUint16(6, 20, true);
      view.setUint16(8, 0x0800, true); view.setUint16(10, 0, true); view.setUint16(12, stamp.time, true); view.setUint16(14, stamp.date, true);
      view.setUint32(16, checksum, true); view.setUint32(20, data.length, true); view.setUint32(24, data.length, true);
      view.setUint16(28, nameBytes.length, true); view.setUint16(30, 0, true); view.setUint16(32, 0, true);
      view.setUint16(34, 0, true); view.setUint16(36, 0, true); view.setUint32(38, 0, true); view.setUint32(42, localOffset, true);
    });
    centralChunks.push(centralHeader, nameBytes);
    localOffset += localHeader.length + nameBytes.length + data.length;
  }
  const central = concat(centralChunks);
  const end = record(22, (view) => {
    view.setUint32(0, 0x06054b50, true); view.setUint16(4, 0, true); view.setUint16(6, 0, true);
    view.setUint16(8, files.length, true); view.setUint16(10, files.length, true);
    view.setUint32(12, central.length, true); view.setUint32(16, localOffset, true); view.setUint16(20, 0, true);
  });
  return concat([...localChunks, central, end]);
}
