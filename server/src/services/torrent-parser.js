import bencode from 'bencode';

/**
 * .torrent 文件解析服务
 */
class TorrentParser {
  /**
   * 解析 .torrent 文件内容
   * @param {Buffer} data - .torrent 文件二进制内容
   * @returns {Object} 解析结果
   */
  parse(data) {
    try {
      const decoded = bencode.decode(data);

      const info = decoded.info;
      if (!info) throw new Error('Invalid torrent: missing info dict');

      // 提取文件列表
      const files = [];
      if (info.files) {
        // 多文件种子
        for (let i = 0; i < info.files.length; i++) {
          const f = info.files[i];
          files.push({
            index: i,
            path: Array.isArray(f.path)
              ? f.path.map(p => p.toString()).join('/')
              : f.path.toString(),
            size: f.length || 0,
          });
        }
      } else {
        // 单文件种子
        files.push({
          index: 0,
          path: info.name ? info.name.toString() : 'unknown',
          size: info.length || 0,
        });
      }

      // 计算总大小
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);

      // 提取 info_hash (SHA1 of info dict)
      const infoHash = this.computeInfoHash(info, bencode.encode(info));

      return {
        name: info.name ? info.name.toString() : 'Unknown',
        files,
        totalSize,
        infoHash,
        pieceLength: info['piece length'] || 0,
        private: info.private === 1,
      };
    } catch (err) {
      console.error('[torrent-parser] Parse error:', err.message);
      return null;
    }
  }

  /**
   * 计算 info_hash
   */
  computeInfoHash(info, encodedInfo) {
    // Simple hash using crypto
    const crypto = require('crypto');
    return crypto.createHash('sha1').update(encodedInfo).digest('hex');
  }
}

const torrentParser = new TorrentParser();
export default torrentParser;
