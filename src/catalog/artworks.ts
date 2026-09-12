import raw from '../../data/artworks.json'

/** 벽에 거는 그림. The Met 오픈 액세스의 CC0 작품이다. */
export interface Artwork {
  title: string
  artist: string
  date: string
  imageUrl: string
  pageUrl: string
}

export const ARTWORKS: readonly Artwork[] = raw.artworks as Artwork[]
export const ARTWORK_SOURCE = {
  name: raw.source,
  licence: raw.licence,
  url: raw.licenceUrl,
}
