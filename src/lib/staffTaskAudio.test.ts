import { describe, expect, it } from 'vitest'
import { formatVoiceDuration, voiceFileExt } from './staffTaskAudio'

describe('staffTaskAudio', () => {
  it('formats duration', () => {
    expect(formatVoiceDuration(0)).toBe('0:00')
    expect(formatVoiceDuration(65)).toBe('1:05')
  })

  it('picks extension from mime', () => {
    expect(voiceFileExt('audio/webm;codecs=opus')).toBe('webm')
    expect(voiceFileExt('audio/mp4')).toBe('m4a')
    expect(voiceFileExt('audio/ogg')).toBe('ogg')
  })
})
