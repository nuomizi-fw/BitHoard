import { execSync } from 'child_process';
import config from '../config.js';

/**
 * 磁盘空间检查服务 (Windows only)
 */
class DiskChecker {
  /**
   * 检查指定路径所在磁盘的剩余空间
   * @param {string} dirPath - 目标路径
   * @returns {{ ok: boolean, freeGB: number, totalGB: number, drive: string, warning: string|null }}
   */
  check(dirPath) {
    try {
      // Windows PowerShell 获取磁盘信息
      const drive = dirPath.charAt(0).toUpperCase() + ':';
      const script = `Get-PSDrive ${drive} | Select-Object Used,Free | ConvertTo-Json`;
      const result = execSync(`powershell -NoProfile -Command "${script}"`, {
        encoding: 'utf-8',
        timeout: 3000,
        windowsHide: true,
      });

      const parsed = JSON.parse(result);
      const freeGB = Math.round((parsed.Free / (1024 * 1024 * 1024)) * 100) / 100;
      const totalGB = Math.round(((parsed.Used + parsed.Free) / (1024 * 1024 * 1024)) * 100) / 100;
      const minFree = config.diskCheck.minFreeGB;

      return {
        ok: freeGB >= minFree,
        freeGB,
        totalGB,
        drive,
        warning: freeGB < minFree
          ? `磁盘 ${drive} 剩余空间不足: ${freeGB}GB (阈值: ${minFree}GB)`
          : null,
      };
    } catch (err) {
      console.error('[disk-check] Error:', err.message);
      return null;
    }
  }
}

const diskChecker = new DiskChecker();
export default diskChecker;
