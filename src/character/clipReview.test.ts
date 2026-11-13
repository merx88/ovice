import { describe, expect, it } from 'vitest'
import { isLoop, parseClipReview, placeOf } from './clipReview'

describe('parseClipReview', () => {
  it('asks for nothing when the address names no clip', () => {
    expect(parseClipReview('')).toBeNull()
    expect(parseClipReview('?fast=1&cam=seat')).toBeNull()
    expect(parseClipReview('?clip=')).toBeNull()
  })

  it('asks for nothing when no name is a clip', () => {
    expect(parseClipReview('?clip=dance')).toBeNull()
    expect(parseClipReview('?clip=Wave,,idle%20')).toBeNull()
  })

  it('plays one clip where it belongs, at its own pace, looking straight ahead', () => {
    expect(parseClipReview('?clip=wave')).toEqual({ clips: ['wave'], place: 'desk', look: null, speed: 1, hold: 3 })
    expect(parseClipReview('?clip=holdFile')?.place).toBe('floor')
  })

  it('plays a list in the order given, leaving out what is not a clip', () => {
    expect(parseClipReview('?clip=standUp,walk,nonsense,sitDown')?.clips).toEqual(['standUp', 'walk', 'sitDown'])
  })

  it('puts the whole list where its first clip belongs unless told otherwise', () => {
    expect(parseClipReview('?clip=standUp,walk,sitDown')?.place).toBe('desk')
    expect(parseClipReview('?clip=walk,holdFile')?.place).toBe('floor')
    expect(parseClipReview('?clip=walk&at=desk')?.place).toBe('desk')
    expect(parseClipReview('?clip=idle&at=floor')?.place).toBe('floor')
    expect(parseClipReview('?clip=idle&at=moon')?.place).toBe('desk')
  })

  it('reads a point to look at', () => {
    expect(parseClipReview('?clip=idle&look=0.5,1.2,3')?.look).toEqual([0.5, 1.2, 3])
    expect(parseClipReview('?clip=idle&look=-2,0,1e1')?.look).toEqual([-2, 0, 10])
  })

  it('ignores a point that is not three numbers', () => {
    expect(parseClipReview('?clip=idle&look=1,2')?.look).toBeNull()
    expect(parseClipReview('?clip=idle&look=1,2,up')?.look).toBeNull()
    expect(parseClipReview('?clip=idle&look=1,2,3,4')?.look).toBeNull()
  })

  it('reads the speed and how long a loop is shown, and keeps to its own for anything else', () => {
    expect(parseClipReview('?clip=walk&speed=1.5&hold=2')).toMatchObject({ speed: 1.5, hold: 2 })
    expect(parseClipReview('?clip=walk&speed=0&hold=-1')).toMatchObject({ speed: 1, hold: 3 })
    expect(parseClipReview('?clip=walk&speed=fast&hold=')).toMatchObject({ speed: 1, hold: 3 })
  })
})

describe('placeOf', () => {
  it('seats the desk clips and stands the others on the floor', () => {
    expect(placeOf('idle')).toBe('desk')
    expect(placeOf('typing')).toBe('desk')
    expect(placeOf('sitDown')).toBe('desk')
    expect(placeOf('walk')).toBe('floor')
    expect(placeOf('holdFile')).toBe('floor')
  })
})

describe('isLoop', () => {
  it('tells the clips that run on from those that end', () => {
    expect(isLoop('idle')).toBe(true)
    expect(isLoop('walk')).toBe(true)
    expect(isLoop('wave')).toBe(false)
    expect(isLoop('standUp')).toBe(false)
  })
})
