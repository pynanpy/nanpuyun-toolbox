import './style.css'
import { mountImageTool } from './tools/image.js'
import { mountVideoTool } from './tools/video.js'
import { mountAudioTool } from './tools/audio.js'
import { mountDocsTool } from './tools/docs.js'

const tools = {
  image: mountImageTool,
  video: mountVideoTool,
  audio: mountAudioTool,
  docs: mountDocsTool,
}

const root = document.getElementById('tool')

function mount(name) {
  document.querySelectorAll('#nav button').forEach((b) => {
    b.classList.toggle('active', b.dataset.tool === name)
  })
  root.innerHTML = ''
  tools[name](root)
}

document.getElementById('nav').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-tool]')
  if (btn) mount(btn.dataset.tool)
})

mount('image')
