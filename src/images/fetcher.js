/**
 * Image Fetcher Module - Pexels API
 * 
 * Fetches stock images and videos from Pexels (free API).
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const PEXELS_API_URL = 'https://api.pexels.com/v1';
const PEXELS_VIDEO_URL = 'https://api.pexels.com/videos';

async function searchImages(query, perPage = 10, page = 1) {
  const apiKey = process.env.PEXELS_API_KEY;
  
  if (!apiKey) {
    throw new Error('PEXELS_API_KEY not set. Get a free key at https://www.pexels.com/api/');
  }
  
  return new Promise((resolve, reject) => {
    const url = `${PEXELS_API_URL}/search?query=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}`;
    
    https.get(url, { headers: { 'Authorization': apiKey } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(`Pexels API error: ${json.error}`));
            return;
          }
          
          const photos = (json.photos || []).map(photo => ({
            id: photo.id,
            url: photo.src.large,
            thumbnail: photo.src.medium,
            full: photo.src.original,
            width: photo.width,
            height: photo.height,
            photographer: photo.photographer,
            alt: photo.alt || query
          }));
          
          resolve({ photos, total: json.total_results, page: json.page });
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Search Pexels for videos
 */
async function searchVideos(query, perPage = 5, orientation = 'landscape') {
  const apiKey = process.env.PEXELS_API_KEY;
  
  if (!apiKey) {
    throw new Error('PEXELS_API_KEY not set');
  }
  
  return new Promise((resolve, reject) => {
    const url = `${PEXELS_VIDEO_URL}/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=${orientation}`;
    
    https.get(url, { headers: { 'Authorization': apiKey } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(`Pexels video error: ${json.error}`));
            return;
          }
          
          const videos = (json.videos || []).map(video => {
            // Find HD quality file
            const hdFile = video.video_files?.find(f => 
              f.width >= 1920 && f.height >= 1080
            ) || video.video_files?.[0];
            
            return {
              id: video.id,
              url: hdFile?.link,
              width: hdFile?.width,
              height: hdFile?.height,
              duration: video.duration,
              photographer: video.user?.name,
              thumbnail: video.image
            };
          }).filter(v => v.url);
          
          resolve({ videos, total: json.total_results });
        } catch (e) {
          reject(new Error(`Failed to parse video response: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

async function downloadImage(imageUrl, outputPath) {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    
    https.get(imageUrl, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        downloadImage(res.headers.location, outputPath).then(resolve).catch(reject);
        return;
      }
      
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve({ path: outputPath, size: fs.statSync(outputPath).size });
      });
    }).on('error', (err) => {
      fs.unlink(outputPath, () => {});
      reject(err);
    });
  });
}

/**
 * Download video from URL
 */
async function downloadVideo(videoUrl, outputPath) {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    
    const follow = (url) => {
      https.get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          follow(res.headers.location);
          return;
        }
        
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve({ path: outputPath, size: fs.statSync(outputPath).size });
        });
      }).on('error', reject);
    };
    
    follow(videoUrl);
  });
}

async function getMysteryImages(type = 'thumbnail') {
  const queries = {
    thumbnail: ['dark mystery', 'foggy forest', 'noir detective', 'shadow figure'],
    background: ['dark abstract', 'mystery atmosphere'],
    scene: ['abandoned house', 'crime scene', 'detective office']
  };
  
  const searchTerms = queries[type] || queries.thumbnail;
  const randomQuery = searchTerms[Math.floor(Math.random() * searchTerms.length)];
  
  return searchImages(randomQuery, 5);
}

module.exports = { searchImages, searchVideos, downloadImage, downloadVideo, getMysteryImages };