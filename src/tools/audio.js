// 3. 音频工具：裁剪 / 格式转换（→ WAV）/ 变速 / 合并
// 用 Web Audio API 解码后处理，导出为 WAV（浏览器原生无 MP3 编码器，
// 如需 MP3 可后续接入 lamejs）。全部本地运行，不上传。
import { downloadBlob, encodeWav, fileStem, fmtBytes, fmtTime, setStatus } from '../lib/files.js'

const ctx = new (window.AudioContext || window.webkitAudioContext)()
let buffer = null
let fileName = 'audio'

export function mountAudioTool(root) {
  root.innerHTML = `
    <h2>音频工具</h2>
    <p class="hint">选一个音频文件：可裁剪、变速、合并多个文件，导出为 WAV；也可以把任意音频转成 WAV。MP3 编码暂不支持导出，后续可接入 lamejs。</p>
    <label class="file-btn">选择音频 <input type="file" id="aud-file" accept="audio/*" hidden></label>
    <label class="file-btn">选择多个音频（合并用） <input type="file" id="aud-multi" accept="audio/*" multiple hidden></label>
    <div id="aud-info" class="info"></div>
    <div class="grid">
      <label>开始时间（秒）<input type="number" id="aud-start" value="0" min="0" step="0.1"></label>
      <label>结束时间（秒，留空 = 到结尾）<input type="number" id="aud-end" placeholder="例如 30" min="0" step="0.1"></label>
      <label>变速倍率 <input type="number" id="aud-rate" value="1" min="0.25" max="4" step="0.25"></label>
    </div>
    <div class="actions">
      <button id="aud-trim" class="primary">裁剪并导出 WAV</button>
      <button id="aud-convert">转为 WAV</button>
      <button id="aud-speed">变速并导出 WAV</button>
      <button id="aud-merge">合并多个音频并导出 WAV</button>
    </div>
    <p id="aud-status" class="status"></p>`

  const $ = (id) => root.querySelector(id)

  async function decode(file) {
    const ab = await file.arrayBuffer()
    return ctx.decodeAudioData(ab)
  }

  function sliceBuffer(buf, start, end) {
    const sr = buf.sampleRate
    const s0 = Math.max(0, Math.floor(start * sr))
    const s1 = Math.min(buf.length, Math.floor(end * sr))
    const out = ctx.createBuffer(buf.numberOfChannels, Math.max(1, s1 - s0), sr)
    for (let c = 0; c < buf.numberOfChannels; c++) {
      out.getChannelData(c).set(buf.getChannelData(c).subarray(s0, s1))
    }
    return out
  }

  $('#aud-file').addEventListener('change', async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      await ctx.resume()
      buffer = await decode(file)
      fileName = fileStem(file.name)
      $('#aud-info').textContent = `${file.name} · 时长 ${fmtTime(buffer.duration)} · ${buffer.sampleRate} Hz · ${buffer.numberOfChannels} 声道 · ${fmtBytes(file.size)}`
      $('#aud-end').placeholder = `到结尾（${buffer.duration.toFixed(1)} 秒）`
      setStatus($('#aud-status'), '已载入音频')
    } catch { setStatus($('#aud-status'), '音频解码失败（格式不受支持）', false) }
  })

  $('#aud-trim').addEventListener('click', () => {
    if (!buffer) return setStatus($('#aud-status'), '请先选择音频', false)
    const start = Math.max(0, parseFloat($('#aud-start').value) || 0)
    const end = parseFloat($('#aud-end').value) || buffer.duration
    if (end <= start) return setStatus($('#aud-status'), '结束时间必须大于开始时间', false)
    downloadBlob(encodeWav(sliceBuffer(buffer, start, end)), `${fileName}-trim.wav`)
    setStatus($('#aud-status'), `已导出裁剪音频（${fmtTime(end - start)}）`)
  })

  $('#aud-convert').addEventListener('click', () => {
    if (!buffer) return setStatus($('#aud-status'), '请先选择音频', false)
    downloadBlob(encodeWav(buffer), `${fileName}.wav`)
    setStatus($('#aud-status'), '已导出 WAV')
  })

  $('#aud-speed').addEventListener('click', async () => {
    if (!buffer) return setStatus($('#aud-status'), '请先选择音频', false)
    const rate = parseFloat($('#aud-rate').value) || 1
    if (rate <= 0) return setStatus($('#aud-status'), '变速倍率须大于 0', false)
    try {
      setStatus($('#aud-status'), '正在变速渲染…')
      const offline = new OfflineAudioContext(buffer.numberOfChannels, Math.ceil(buffer.length / rate), buffer.sampleRate)
      const src = offline.createBufferSource()
      src.buffer = buffer
      src.playbackRate.value = rate
      src.connect(offline.destination)
      src.start()
      const rendered = await offline.startRendering()
      downloadBlob(encodeWav(rendered), `${fileName}-${rate}x.wav`)
      setStatus($('#aud-status'), `已导出 ${rate} 倍速音频（时长 ${fmtTime(rendered.duration)}）`)
    } catch { setStatus($('#aud-status'), '变速失败', false) }
  })

  $('#aud-merge').addEventListener('click', async () => {
    const files = [...$('#aud-multi').files]
    if (files.length < 2) return setStatus($('#aud-status'), '请先选 2 个以上音频文件（合并用）', false)
    try {
      setStatus($('#aud-status'), '正在合并…')
      await ctx.resume()
      const bufs = []
      for (const f of files) bufs.push(await decode(f))
      const sr = bufs[0].sampleRate
      const ch = Math.max(...bufs.map((b) => b.numberOfChannels))
      const total = bufs.reduce((a, b) => a + b.length, 0)
      const out = ctx.createBuffer(ch, total, sr)
      let off = 0
      for (const b of bufs) {
        for (let c = 0; c < ch; c++) {
          const src = b.numberOfChannels > c ? b.getChannelData(c) : b.getChannelData(0)
          out.getChannelData(c).set(src, off)
        }
        off += b.length
      }
      downloadBlob(encodeWav(out), 'merged.wav')
      setStatus($('#aud-status'), `已导出合并音频（${files.length} 个文件，总时长 ${fmtTime(out.duration)}）`)
    } catch { setStatus($('#aud-status'), '合并失败（请确认各文件采样率一致且格式受支持）', false) }
  })
}
