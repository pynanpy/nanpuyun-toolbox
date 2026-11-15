// 4. 文档与文件工具：PDF 合并 / 拆分 / 图片转 PDF / 文本转 PDF /
//    文件批量重命名 / 文本对比 / 字数统计
// PDF 用 pdf-lib；文本转 PDF 时把文字画到 Canvas 再嵌入 PDF，
// 这样中文也能正常显示（pdf-lib 自带字体不支持中文）。
import { PDFDocument } from 'pdf-lib'
import { downloadBlob, fileStem, fmtBytes, setStatus } from '../lib/files.js'

export function mountDocsTool(root) {
  root.innerHTML = `
    <h2>文档与文件工具</h2>
    <p class="hint">PDF 合并、拆分、图片转 PDF、文本转 PDF、批量重命名、文本对比、字数统计，全部本地运行，不上传。</p>

    <h3>PDF 合并 / 拆分</h3>
    <label class="file-btn">选择多个 PDF（合并用） <input type="file" id="pdf-merge" accept="application/pdf" multiple hidden></label>
    <button id="pdf-merge-btn" class="primary">合并并导出 PDF</button>
    <label class="file-btn">选择一个 PDF（拆分用） <input type="file" id="pdf-split" accept="application/pdf" hidden></label>
    <label>拆分：每几个页面一个文件 <input type="number" id="pdf-split-n" value="1" min="1" style="width:80px"></label>
    <button id="pdf-split-btn">拆分并导出</button>

    <h3>图片转 PDF / 文本转 PDF</h3>
    <label class="file-btn">选择多张图片 <input type="file" id="pdf-imgs" accept="image/*" multiple hidden></label>
    <button id="pdf-imgs-btn">图片转 PDF</button>
    <textarea id="pdf-text" rows="5" placeholder="在这里输入要转成 PDF 的文字（支持中文）"></textarea>
    <button id="pdf-text-btn">文本转 PDF</button>

    <h3>文件批量重命名</h3>
    <label class="file-btn">选择多个文件 <input type="file" id="ren-files" multiple hidden></label>
    <label>命名格式（{n}=序号，{name}=原名，{ext}=扩展名）<input type="text" id="ren-pattern" value="文件-{n}.{ext}" style="width:260px"></label>
    <button id="ren-btn">预览并逐个下载重命名后的文件</button>
    <div id="ren-preview" class="info"></div>

    <h3>文本对比 / 字数统计</h3>
    <div class="grid">
      <textarea id="diff-a" rows="6" placeholder="文本 A"></textarea>
      <textarea id="diff-b" rows="6" placeholder="文本 B"></textarea>
    </div>
    <button id="diff-btn">对比（按行）</button>
    <div id="diff-out" class="info" style="white-space:pre-wrap"></div>
    <p id="count-out" class="info"></p>
    <p id="docs-status" class="status"></p>`

  const $ = (id) => root.querySelector(id)
  const status = (m, ok) => setStatus($('#docs-status'), m, ok)

  async function loadPdf(file) {
    return PDFDocument.load(await file.arrayBuffer())
  }

  $('#pdf-merge-btn').addEventListener('click', async () => {
    const files = [...$('#pdf-merge').files]
    if (files.length < 2) return status('请先选 2 个以上 PDF', false)
    try {
      const out = await PDFDocument.create()
      for (const f of files) {
        const src = await loadPdf(f)
        const pages = await out.copyPages(src, src.getPageIndices())
        pages.forEach((p) => out.addPage(p))
      }
      downloadBlob(new Blob([await out.save()], { type: 'application/pdf' }), 'merged.pdf')
      status(`已合并 ${files.length} 个 PDF，共 ${out.getPageCount()} 页`)
    } catch { status('合并失败（请确认文件是有效 PDF）', false) }
  })

  $('#pdf-split-btn').addEventListener('click', async () => {
    const file = $('#pdf-split').files[0]
    if (!file) return status('请先选一个 PDF', false)
    const n = Math.max(1, parseInt($('#pdf-split-n').value, 10) || 1)
    try {
      const src = await loadPdf(file)
      const total = src.getPageCount()
      for (let i = 0; i < total; i += n) {
        const out = await PDFDocument.create()
        const pages = await out.copyPages(src, Array.from({ length: Math.min(n, total - i) }, (_, k) => i + k))
        pages.forEach((p) => out.addPage(p))
        downloadBlob(new Blob([await out.save()], { type: 'application/pdf' }), `${fileStem(file.name)}-p${i + 1}-${Math.min(i + n, total)}.pdf`)
      }
      status(`已拆分 ${total} 页，每 ${n} 页一个文件`)
    } catch { status('拆分失败', false) }
  })

  $('#pdf-imgs-btn').addEventListener('click', async () => {
    const files = [...$('#pdf-imgs').files]
    if (!files.length) return status('请先选图片', false)
    try {
      const pdf = await PDFDocument.create()
      for (const f of files) {
        const bytes = new Uint8Array(await f.arrayBuffer())
        const img = f.type === 'image/png'
          ? await pdf.embedPng(bytes)
          : await pdf.embedJpg(bytes)
        const page = pdf.addPage([img.width, img.height])
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
      }
      downloadBlob(new Blob([await pdf.save()], { type: 'application/pdf' }), 'images.pdf')
      status(`已把 ${files.length} 张图片转成 PDF`)
    } catch { status('图片转 PDF 失败（JPG/PNG 支持最好）', false) }
  })

  $('#pdf-text-btn').addEventListener('click', async () => {
    const text = $('#pdf-text').value.trim()
    if (!text) return status('请先输入文字', false)
    try {
      const pdf = await PDFDocument.create()
      const lines = text.split('\n')
      const fontSize = 16, lineH = 26, margin = 48
      const pageW = 595, pageH = 842 // A4 pt
      let page = pdf.addPage([pageW, pageH])
      let y = pageH - margin - fontSize
      // 逐行画到 Canvas 再嵌入，保证中文显示
      for (const rawLine of lines) {
        const wrapped = wrapLine(rawLine, 34)
        for (const line of wrapped.length ? wrapped : ['']) {
          if (y < margin) { page = pdf.addPage([pageW, pageH]); y = pageH - margin - fontSize }
          const c = document.createElement('canvas')
          c.width = 1000; c.height = 40
          const cctx = c.getContext('2d')
          cctx.font = '32px sans-serif'
          cctx.fillStyle = '#000'
          cctx.fillText(line, 4, 30)
          const png = await pdf.embedPng(await new Promise((r) => c.toBlob(r, 'image/png')))
          page.drawImage(png, { x: margin, y: y - 14, width: pageW - margin * 2, height: 18 })
          y -= lineH
        }
      }
      downloadBlob(new Blob([await pdf.save()], { type: 'application/pdf' }), 'text.pdf')
      status('已导出文本 PDF')
    } catch { status('文本转 PDF 失败', false) }
  })

  function wrapLine(line, maxChars) {
    const out = []
    for (let i = 0; i < line.length; i += maxChars) out.push(line.slice(i, i + maxChars))
    return out
  }

  $('#ren-btn').addEventListener('click', () => {
    const files = [...$('#ren-files').files]
    const pattern = $('#ren-pattern').value || '{name}.{ext}'
    if (!files.length) return status('请先选文件', false)
    const preview = files.map((f, i) => {
      const ext = f.name.includes('.') ? f.name.split('.').pop() : ''
      const name = pattern.replaceAll('{n}', String(i + 1).padStart(2, '0')).replaceAll('{name}', fileStem(f.name)).replaceAll('{ext}', ext)
      return { file: f, name }
    })
    $('#ren-preview').textContent = preview.map((p) => `${p.file.name} → ${p.name}`).join('\n')
    preview.forEach((p) => downloadBlob(p.file, p.name))
    status(`已按新名字逐个下载 ${preview.length} 个文件（浏览器无法直接改原文件，下载即为重命名后的副本）`)
  })

  function count(text) {
    const chars = text.replace(/\s/g, '').length
    const words = text.trim() ? text.trim().split(/\s+/).length : 0
    const lines = text ? text.split('\n').length : 0
    return `字数统计：${chars} 字（不含空白）· ${words} 词 · ${lines} 行`
  }

  $('#diff-btn').addEventListener('click', () => {
    const a = $('#diff-a').value.split('\n')
    const b = $('#diff-b').value.split('\n')
    const setB = new Set(b)
    const setA = new Set(a)
    const onlyA = a.filter((l) => !setB.has(l))
    const onlyB = b.filter((l) => !setA.has(l))
    $('#diff-out').textContent =
      `仅 A 有（${onlyA.length} 行）：\n${onlyA.map((l) => '- ' + l).join('\n')}\n\n仅 B 有（${onlyB.length} 行）：\n${onlyB.map((l) => '+ ' + l).join('\n')}`
    $('#count-out').textContent = `A：${count($('#diff-a').value)}　|　B：${count($('#diff-b').value)}`
    status('对比完成（按行比对，相同行不显示）')
  })
  ;['#diff-a', '#diff-b'].forEach((sel) => {
    $(sel).addEventListener('input', () => {
      $('#count-out').textContent = `A：${count($('#diff-a').value)}　|　B：${count($('#diff-b').value)}`
    })
  })
}
