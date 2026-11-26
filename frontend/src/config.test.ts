import { describe, expect, it } from 'vitest'
import { apiUrl } from './config'
import { socketUrl } from './game/socket'

const RENDER = 'https://quizcircuit.onrender.com'

describe('apiUrl', () => {
  it('stays relative in dev (no backend URL set)', () => {
    expect(apiUrl('/rooms', '')).toBe('/rooms')
  })

  it('points at the backend in production', () => {
    expect(apiUrl('/rooms', RENDER)).toBe(`${RENDER}/rooms`)
  })
})

describe('socketUrl', () => {
  const page = (url: string) => new URL(url) as unknown as Location

  it('uses this site in dev, so Vite can forward it', () => {
    expect(socketUrl('QC-1', '', page('http://localhost:5173/host/QC-1'))).toBe(
      'ws://localhost:5173/ws/QC-1',
    )
    expect(socketUrl('QC-1', '', page('https://example.com/'))).toBe('wss://example.com/ws/QC-1')
  })

  it('goes straight to the backend in production (https -> wss)', () => {
    expect(socketUrl('QC-1', RENDER, page('https://quizcircuit.vercel.app/'))).toBe(
      'wss://quizcircuit.onrender.com/ws/QC-1',
    )
    expect(socketUrl('QC-1', 'http://127.0.0.1:8000')).toBe('ws://127.0.0.1:8000/ws/QC-1')
  })
})
