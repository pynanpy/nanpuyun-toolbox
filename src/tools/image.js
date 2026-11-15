// 1. 图片工具：压缩 / 尺寸调整 / 裁剪 / 加水印 / 格式转换 / 图片转 PDF
// 全部用 Canvas + pdf-lib 在本地完成，不上传。
import { PDFDocument } from 'pdf-lib'
import { canvasToBlob, downloadBlob, fileStem, fmtBytes, loadImage, setStatus } from '../lib/files.js'

let current = null // { file, img, url }

export function mountImageTool(root) {
  root.innerHTML = `
    <h2>图片工具</h2>
    <p class="hint">先选一张图片，再做压缩、改尺寸、裁剪或加水印，最后点「导出」。图片只在本地处理，不上传。</p>
    <label class="file-btn">选择图片 <input type="file" id="img-file" accept="image/*" hidden></label>
    <div id="img-info" class="info"></div>
    <div class="preview"><canvas id="img-canvas"></canvas></div>

    <div class="grid">
      <label>输出格式
        <select id="img-format"><option value="image/jpeg">JPG</option><option value="image/webp">WebP</option><option value="image/png">PNG</option></select>
      </label>
      <label>压缩质量 <span id="img-q-val">0.85</span>
        <input type="range" id="img-quality" min="0.1" max="1" step="0.05" value="0.85">
      </label>
      <label>宽度 px（留空 = 原尺寸）<input type="number" id="img-width" placeholder="例如 1080"></label>
      <label>高度 px（留空 = 按比例）<input type="number" id="img-height" placeholder="例如 720"></label>
    </div>
    <fieldset><legend>裁剪（px，留空 = 不裁剪）</legend>
      <div class="grid">
        <label>左 X <input type="number" id="img-cx" value="0"></label>
        <label>上 Y <input type="number" id="img-cy" value="0"></label>
        <label>裁剪宽 <input type="number" id="img-cw" placeholder="原宽"></label>
        <label>裁剪高 <input type="number" id="img-ch" placeholder="原高"></label>
      </div>
    </fieldset>
    <fieldset><legend>水印</legend>
      <div class="grid">
        <label>水印文字 <input type="text" id="img-wm" placeholder="例如 南浦云工具箱"></label>
        <label>位置
          <select id="img-wm-pos"><option value="br">右下</option><option value="bl">左下</option><option value="tr">右上</option><option value="tl">左上</option><option value="center">居中</option></select>
        </label>
      </div>
    </fieldset>
    <div class="actions">
      <button id="img-apply" class="primary">预览处理结果</button>
      <button id="img-export">导出图片</button>
      <button id="img-topdf">导出为 PDF</button>
    </div>
    <p id="img-status" class="status"></p>`

  const $ = (id) => root.querySelector(id)
  const canvas = $('#img-canvas')
  const ctx = canvas.getContext('2d')
  let processed = null // 画好处理结果的 canvas

  $('#img-quality').addEventListener('input', (e) => { $('#img-q-val').textContent = e.target.value })

  $('#img-file').addEventListener('change', async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      const { img, url } = await loadImage(file)
      current = { file, img, url }
      $('#img-info').textContent = `${file.name} · ${img.naturalWidth}×${img.naturalHeight} · ${fmtBytes(file.size)}`
      $('#img-cw').placeholder = String(img.naturalWidth)
      $('#img-ch').placeholder = String(img.naturalHeight)
      drawOriginal()
      setStatus($('#img-status'), '已载入图片')
    } catch (err) { setStatus($('#img-status'), err.message, false) }
  })

  function drawOriginal() {
    canvas.width = current.img.naturalWidth
    canvas.height = current.img.naturalHeight
    ctx.drawImage(current.img, 0, 0)
    processed = canvas
  }

  function apply() {
    if (!current) { setStatus($('#img-status'), '请先选择图片', false); return null }
    const img = current.img
    const cx = +$('#img-cx').value || 0
    const cy = +$('#img-cy').value || 0
    const cw = +$('#img-cw').value || img.naturalWidth - cx
    const ch = +$('#img-ch').value || img.naturalHeight - cy
    const w = +$('#img-width').value || 0
    const h = +$('#img-height').value || 0
    const scale = w && h ? Math.min(w / cw, h / ch) : w ? w / cw : h ? h / ch : 1
    const outW = Math.max(1, Math.round(cw * scale))
    const outH = Math.max(1, Math.round(ch * scale))
    const out = document.createElement('canvas')
    out.width = outW; out.height = outH
    const octx = out.getContext('2d')
    octx.drawImage(img, cx, cy, cw, ch, 0, 0, outW, outH)
    const wm = $('#img-wm').value.trim()
    if (wm) {
      const size = Math.max(16, Math.round(outW / 25))
      octx.font = `bold ${size}px sans-serif`
      octx.fillStyle = 'rgba(255,255,255,0.75)'
      octx.strokeStyle = 'rgba(0,0,0,0.45)'
      octx.lineWidth = 3
      const tw = octx.measureText(wm).width
      const pad = 12
      const pos = $('#img-wm-pos').value
      const x = pos.includes('l') ? pad : pos.includes('r') ? outW - tw - pad : (outW - tw) / 2
      const y = pos.includes('t') ? size + pad : pos.includes('b') ? outH - pad : outH / 2
      octx.strokeText(wm, x, y)
      octx.fillText(wm, x, y)
    }
    // 在预览画布上展示处理结果
    canvas.width = outW; canvas.height = outH
    ctx.drawImage(out, 0, 0)
    processed = out
    return out
  }

  $('#img-apply').addEventListener('click', () => {
    if (apply()) setStatus($('#img-status'), '已生成预览，可导出')
  })

  $('#img-export').addEventListener('click', async () => {
    const out = apply()
    if (!out) return
    const type = $('#img-format').value
    const q = parseFloat($('#img-quality').value)
    const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'
    try {
      const blob = await canvasToBlob(out, type, q)
      downloadBlob(blob, `${fileStem(current.file.name)}-toolbox.${ext}`)
      setStatus($('#img-status'), `已导出（${fmtBytes(blob.size)}，原图 ${fmtBytes(current.file.size)}）`)
    } catch (err) { setStatus($('#img-status'), err.message, false) }
  })

  $('#img-topdf').addEventListener('click', async () => {
    const out = apply()
    if (!out) return
    try {
      const blob = await canvasToBlob(out, 'image/jpeg', 0.92)
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const pdf = await PDFDocument.create()
      const img = await pdf.embedJpg(bytes)
      const page = pdf.addPage([img.width, img.height])
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
      downloadBlob(new Blob([await pdf.save()], { type: 'application/pdf' }), `${fileStem(current.file.name)}.pdf`)
      setStatus($('#img-status'), '已导出 PDF')
    } catch (err) { setStatus($('#img-status'), err.message, false) }
  })
}
