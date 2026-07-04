import { mount } from 'svelte'
import App from './App.svelte'

const target = document.getElementById('app')
if (!target) throw new Error('renderer: #app mount point missing')

mount(App, { target })
