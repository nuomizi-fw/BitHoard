import { Router } from 'express';
import tmdbService from '../services/tmdb.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('routes-tmdb');
const router = Router();

/**
 * 搜索 TMDB
 * GET /api/tmdb/search?q=keyword&type=movie|tv|multi
 */
router.get('/search', async (req, res) => {
  const { q, type = 'multi' } = req.query;

  if (!q) {
    return res.status(400).json({ error: 'Query parameter q is required' });
  }

  if (!tmdbService.enabled) {
    return res.status(503).json({ error: 'TMDB API not configured (set TMDB_API_KEY)' });
  }

  try {
    const result = await tmdbService.searchMulti(q);
    res.json(result);
  } catch (err) {
    log.error('TMDB search failed:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 获取电影详情
 * GET /api/tmdb/movie/:id
 */
router.get('/movie/:id', async (req, res) => {
  try {
    const result = await tmdbService.getMovie(req.params.id);
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json(result);
  } catch (err) {
    log.error('TMDB getMovie failed:', req.params.id, err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 获取电视剧详情
 * GET /api/tmdb/tv/:id
 */
router.get('/tv/:id', async (req, res) => {
  try {
    const result = await tmdbService.getTV(req.params.id);
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json(result);
  } catch (err) {
    log.error('TMDB getTV failed:', req.params.id, err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
