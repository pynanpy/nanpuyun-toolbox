// 通用文件 / 下载 / 格式化工具（全部本地运行，不上传）
export function fmtBytes(n) {
  if (!Number.isFinite(n)) return '-'
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(2)} ${units[i]}`
}

export function fmtTime(sec) {
  if (!Number.isFinite(sec)) return '-'
  const s = Math.floor(sec % 60)
  const m = Math.floor(sec / 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export function fileStem(name) {
  return name.replace(/\.[^.]+$/, '')
}

export function fileExt(name) {
  const m = name.match(/\.([^.]+)$/)
  return m ? m[1].toLowerCase() : ''
}

export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve({ img, url })
    img.onerror = () => reject(new Error('图片读取失败'))
    img.src = url
  })
}

/** 把 <canvas> 按指定格式/质量导出为 Blob */
export function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.9) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('导出失败'))), type, quality)
  })
}

/** 在页面上显示一条状态/结果信息 */
export function setStatus(el, msg, ok = true) {
  if (!el) return
  el.textContent = msg
  el.style.color = ok ? '#15803d' : '#b91c1c'
}

/** 16-bit PCM WAV 编码器（音频裁剪 / 变速 / 合并后导出用） */
export function encodeWav(audioBuffer) {
  const numCh = Math.min(audioBuffer.numberOfChannels, 2)
  const sr = audioBuffer.sampleRate
  const len = audioBuffer.length * numCh * 2
  const buf = new ArrayBuffer(44 + len)
  const v = new DataView(buf)
  const wstr = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  wstr(0, 'RIFF'); v.setUint32(4, 36 + len, true); wstr(8, 'WAVE'); wstr(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, numCh, true)
  v.setUint32(24, sr, true); v.setUint32(28, sr * numCh * 2, true)
  v.setUint16(32, numCh * 2, true); v.setUint16(34, 16, true); wstr(36, 'data'); v.setUint32(40, len, true)
  let off = 44
  const chans = []
  for (let c = 0; c < numCh; c++) chans.push(audioBuffer.getChannelData(c))
  for (let i = 0; i < audioBuffer.length; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]))
      v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      off += 2
    }
  }
  return new Blob([buf], { type: 'audio/wav' })
}
