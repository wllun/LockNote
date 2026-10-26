// A standard, uncompressed USTAR archive. Entries are streamed one at a time;
// native exports never concatenate all image bytes into one JS allocation.
export const encodeBackupText = (text) => {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(String(text));
  const bytes = [];
  for (const char of String(text)) {
    let code = char.codePointAt(0);
    if (code >= 0xd800 && code <= 0xdfff) code = 0xfffd;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | code >> 6, 0x80 | code & 63);
    else if (code < 0x10000) bytes.push(0xe0 | code >> 12, 0x80 | code >> 6 & 63, 0x80 | code & 63);
    else bytes.push(0xf0 | code >> 18, 0x80 | code >> 12 & 63, 0x80 | code >> 6 & 63, 0x80 | code & 63);
  }
  return new Uint8Array(bytes);
};

export const backupTextEntry = (name, text) => {
  const bytes = encodeBackupText(text);
  return { name, size: bytes.length, chunks: () => [bytes] };
};

export const createTarHeader = (name, size, date = new Date()) => {
  if (!/^[a-zA-Z0-9_./-]{1,100}$/.test(name) || name.startsWith('/') || name.split('/').includes('..')) {
    throw new Error('Invalid backup archive filename.');
  }
  if (!Number.isSafeInteger(size) || size < 0 || size > 0o77777777777) throw new Error('Backup file size is unsupported.');
  const header = new Uint8Array(512);
  const put = (offset, text) => { for (let index = 0; index < text.length; index++) header[offset + index] = text.charCodeAt(index); };
  const octal = (value, width) => Math.floor(value).toString(8).padStart(width - 1, '0') + '\0';
  put(0, name); put(100, octal(0o600, 8)); put(108, octal(0, 8)); put(116, octal(0, 8));
  put(124, octal(size, 12)); put(136, octal(Math.floor(date.getTime() / 1000), 12));
  put(148, '        '); put(156, '0'); put(257, 'ustar\0'); put(263, '00');
  const checksum = header.reduce((sum, value) => sum + value, 0);
  put(148, checksum.toString(8).padStart(6, '0') + '\0 ');
  return header;
};

export const writeBackupTar = async (entries, write, date = new Date()) => {
  for (const entry of entries) {
    await write(createTarHeader(entry.name, entry.size, date));
    let written = 0;
    for await (const chunk of entry.chunks()) {
      if (!(chunk instanceof Uint8Array) || written + chunk.length > entry.size) throw new Error(`Backup file changed while reading ${entry.name}.`);
      await write(chunk);
      written += chunk.length;
    }
    if (written !== entry.size) throw new Error(`Backup file could not be completely read: ${entry.name}.`);
    if (entry.size % 512) await write(new Uint8Array(512 - entry.size % 512));
  }
  await write(new Uint8Array(1024));
};
