import config from '../config.js';

/**
 * TMDB 元数据查询服务
 */
class TMDBService {
  constructor() {
    this.apiKey = config.tmdb.apiKey;
    this.language = config.tmdb.language;
    this.baseUrl = 'https://api.themoviedb.org/3';
  }

  get enabled() {
    return !!this.apiKey;
  }

  /**
   * 按标题搜索影视信息 (仅返回首个结果)
   */
  async search(title) {
    if (!this.enabled) return null;

    try {
      const res = await fetch(
        `${this.baseUrl}/search/multi?api_key=${this.apiKey}&language=${this.language}&query=${encodeURIComponent(title)}&page=1`
      );
      if (!res.ok) return null;
      const data = await res.json();
      return data.results?.[0] || null;
    } catch (err) {
      console.error('[tmdb] Search error:', err.message);
      return null;
    }
  }

  /**
   * 搜索影视信息 (返回全部结果列表)
   */
  async searchMulti(title) {
    if (!this.enabled) return null;

    try {
      const res = await fetch(
        `${this.baseUrl}/search/multi?api_key=${this.apiKey}&language=${this.language}&query=${encodeURIComponent(title)}&page=1`
      );
      if (!res.ok) return null;
      const data = await res.json();
      return { results: data.results || [], total: data.total_results || 0 };
    } catch (err) {
      console.error('[tmdb] Search error:', err.message);
      return null;
    }
  }

  /**
   * 获取电影详情
   */
  async getMovie(movieId) {
    if (!this.enabled) return null;

    try {
      const res = await fetch(
        `${this.baseUrl}/movie/${movieId}?api_key=${this.apiKey}&language=${this.language}`
      );
      if (!res.ok) return null;
      return res.json();
    } catch (err) {
      console.error('[tmdb] Movie error:', err.message);
      return null;
    }
  }

  /**
   * 获取电视剧详情
   */
  async getTV(tvId) {
    if (!this.enabled) return null;

    try {
      const res = await fetch(
        `${this.baseUrl}/tv/${tvId}?api_key=${this.apiKey}&language=${this.language}`
      );
      if (!res.ok) return null;
      return res.json();
    } catch (err) {
      console.error('[tmdb] TV error:', err.message);
      return null;
    }
  }

  /**
   * 获取海报完整 URL
   */
  getPosterUrl(path, size = 'w500') {
    if (!path) return null;
    return `https://image.tmdb.org/t/p/${size}${path}`;
  }

  /**
   * 自动匹配：输入标题尝试找到最佳匹配的元数据
   */
  async autoMatch(title) {
    const result = await this.search(title);
    if (!result) return null;

    try {
      let details = null;
      if (result.media_type === 'movie') {
        details = await this.getMovie(result.id);
      } else if (result.media_type === 'tv') {
        details = await this.getTV(result.id);
      }

      return {
        title: result.title || result.name,
        originalTitle: result.original_title || result.original_name,
        year: (result.release_date || result.first_air_date || '').substring(0, 4),
        overview: result.overview,
        posterUrl: this.getPosterUrl(result.poster_path),
        backdropUrl: this.getPosterUrl(result.backdrop_path),
        rating: result.vote_average,
        genres: details?.genres?.map(g => g.name) || [],
        mediaType: result.media_type,
      };
    } catch (err) {
      console.error('[tmdb] AutoMatch error:', err.message);
      return null;
    }
  }
}

const tmdbService = new TMDBService();
export default tmdbService;
