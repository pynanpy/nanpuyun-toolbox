// 2. 视频工具：查看信息 / 提取封面 / 裁剪时长 / 压缩重编码 / 提取音频
// 方案说明：浏览器没有 ffmpeg，压缩与裁剪用 MediaRecorder 对播放流重编码
// （画质取决于浏览器支持的编码器，WebM 为主）；提取音频用只含音频轨的
// MediaStream 录制为 WebM 音频。全部本地运行，不上传。
import { downloadBlob, fileStem, fmtBytes, fmtTime, setStatus } from '../lib/files.js'

let current = null // { file, url, video }

export function mountVideoTool(root) {
  root.innerHTML = `
    <h2>视频工具</h2>
    <p class="hint">选一个视频文件：可查看信息、提取封面、裁剪一段、压缩重编码、提取音频。重编码在浏览器本地完成，输出为 WebM 格式；大文件处理需要等待播放完成。</p>
    <label class="file-btn">选择视频 <input type="file" id="vid-file" accept="video/*" hidden></label>
    <div id="vid-info" class="info"></div>
    <video id="vid-player" controls playsinline style="max-width:100%;background:#000"></video>
    <div class="grid">
      <label>开始时间（秒）<input type="number" id="vid-start" value="0" min="0" step="0.1"></label>
      <label>结束时间（秒，留空 = 到结尾）<input type="number" id="vid-end" placeholder="例如 10" min="0" step="0.1"></label>
      <label>压缩码率
        <select id="vid-bitrate"><option value="2500000">高（2.5 Mbps）</option><option value="1000000" selected>中（1 Mbps）</option><option value="500000">低（0.5 Mbps）</option></select>
      </label>
    </div>
    <div class="actions">
      <button id="vid-cover" class="primary">提取封面（当前帧 → PNG）</button>
      <button id="vid-trim">裁剪并导出（选定时间段）</button>
      <button id="vid-compress">压缩重编码（整段）</button>
      <button id="vid-audio">提取音频（WebM 音频）</button>
    </div>
    <p id="vid-status" class="status"></p>
    <progress id="vid-progress" value="0" max="100" style="width:100%;display:none"></progress>`

  const $ = (id) => root.querySelector(id)
  const video = $('#vid-player')

  $('#vid-file').addEventListener('change', (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (current) URL.revokeObjectURL(current.url)
    const url = URL.createObjectURL(file)
    current = { file, url }
    video.src = url
    video.onloadedmetadata = () => {
      $('#vid-info').textContent =
        `${file.name} · ${video.videoWidth}×${video.videoHeight} · 时长 ${fmtTime(video.duration)} · ${fmtBytes(file.size)}`
      $('#vid-end').placeholder = `到结尾（${video.duration.toFixed(1)} 秒）`
      setStatus($('#vid-status'), '已载入视频')
    }
  })

  function pickMime(audioOnly = false) {
    const candidates = audioOnly
      ? ['audio/webm;codecs=opus', 'audio/webm', 'video/webm;codecs=opus']
      : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    return candidates.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || ''
  }

  /** 播放 [start, end) 一段并用 MediaRecorder 录制，返回 Blob */
  async function recordSegment({ start, end, audioOnly, bitrate }) {
    if (!current) throw new Error('请先选择视频')
    if (!window.MediaRecorder) throw new Error('当前浏览器不支持 MediaRecorder')
    const stream = audioOnly
      ? new MediaStream(video.captureStream().getAudioTracks())
      : video.captureStream()
    if (!stream.getTracks().length) throw new Error(audioOnly ? '该视频没有音轨' : '无法获取视频流')
    const mime = pickMime(audioOnly)
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: bitrate } : { videoBitsPerSecond: bitrate })
    const chunks = []
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
    const done = new Promise((resolve) => { rec.onstop = resolve })
    const prog = $('#vid-progress')
    prog.style.display = 'block'
    video.currentTime = start
    await new Promise((r) => { video.onseeked = r })
    await video.play()
    rec.start(250)
    await new Promise((resolve) => {
      const tick = () => {
        const t = video.currentTime
        prog.value = end ? Math.min(100, ((t - start) / (end - start)) * 100) : 0
        if (t >= end || video.ended) { video.pause(); resolve() } else requestAnimationFrame(tick)
      }
      tick()
    })
    rec.stop()
    await done
    prog.style.display = 'none'
    return new Blob(chunks, { type: mime || (audioOnly ? 'audio/webm' : 'video/webm') })
  }

  $('#vid-cover').addEventListener('click', () => {
    if (!current || !video.videoWidth) { setStatus($('#vid-status'), '请先选择视频并等待加载', false); return }
    const c = document.createElement('canvas')
    c.width = video.videoWidth; c.height = video.videoHeight
    c.getContext('2d').drawImage(video, 0, 0)
    c.toBlob((b) => {
      downloadBlob(b, `${fileStem(current.file.name)}-cover.png`)
      setStatus($('#vid-status'), `已提取封面（${video.videoWidth}×${video.videoHeight}，当前帧 ${fmtTime(video.currentTime)}）`)
    }, 'image/png')
  })

  $('#vid-trim').addEventListener('click', async () => {
    try {
      const start = Math.max(0, parseFloat($('#vid-start').value) || 0)
      const end = parseFloat($('#vid-end').value) || video.duration
      if (end <= start) throw new Error('结束时间必须大于开始时间')
      setStatus($('#vid-status'), '正在裁剪（播放并录制该段）…')
      const blob = await recordSegment({ start, end, audioOnly: false, bitrate: parseInt($('#vid-bitrate').value, 10) })
      downloadBlob(blob, `${fileStem(current.file.name)}-trim.webm`)
      setStatus($('#vid-status'), `已导出裁剪视频（${fmtBytes(blob.size)}，${fmtTime(end - start)}）`)
    } catch (err) { setStatus($('#vid-status'), err.message, false) }
  })

  $('#vid-compress').addEventListener('click', async () => {
    try {
      setStatus($('#vid-status'), '正在压缩重编码（播放整段并录制）…')
      const blob = await recordSegment({ start: 0, end: video.duration, audioOnly: false, bitrate: parseInt($('#vid-bitrate').value, 10) })
      downloadBlob(blob, `${fileStem(current.file.name)}-compressed.webm`)
      setStatus($('#vid-status'), `已导出压缩视频（${fmtBytes(blob.size)}，原文件 ${fmtBytes(current.file.size)}）`)
    } catch (err) { setStatus($('#vid-status'), err.message, false) }
  })

  $('#vid-audio').addEventListener('click', async () => {
    try {
      setStatus($('#vid-status'), '正在提取音频（播放整段并录制音轨）…')
      const blob = await recordSegment({ start: 0, end: video.duration, audioOnly: true, bitrate: 128000 })
      downloadBlob(blob, `${fileStem(current.file.name)}-audio.webm`)
      setStatus($('#vid-status'), `已导出音频（${fmtBytes(blob.size)}）`)
    } catch (err) { setStatus($('#vid-status'), err.message, false) }
  })
}
