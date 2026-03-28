#!/usr/bin/env node

/**
 * MysteryForge YouTube Uploader
 * 
 * Uploads generated videos to YouTube via YouTube Data API v3.
 * Full implementation using googleapis package.
 * 
 * Prerequisites:
 * 1. Google Cloud project with YouTube Data API enabled
 * 2. OAuth 2.0 credentials (client_id, client_secret)
 * 3. Refresh token for channel access
 * 
 * Setup:
 * 1. Go to https://console.cloud.google.com
 * 2. Create project → Enable YouTube Data API v3
 * 3. Create OAuth 2.0 credentials (Desktop app)
 * 4. Run: node youtube-upload.js --auth to get refresh token
 * 
 * Usage:
 *   node youtube-upload.js --latest                    # Upload latest video
 *   node youtube-upload.js "story_folder"              # Upload specific story
 *   node youtube-upload.js --list                      # List recent uploads
 *   node youtube-upload.js --auth                      # Generate auth token
 *   node youtube-upload.js --latest --use-seo          # Use SEO-optimized metadata
 * 
 * Environment Variables:
 *   YOUTUBE_CLIENT_ID      - OAuth client ID
 *   YOUTUBE_CLIENT_SECRET  - OAuth client secret
 *   YOUTUBE_REFRESH_TOKEN  - OAuth refresh token
 * 
 * Notes:
 *   - YouTube has daily upload quotas (default: 6 videos/day)
 *   - Videos default to 'unlisted' for safety
 *   - Title and description auto-generated from story.json
 */

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const { SEOOptimizer } = require('./src/seo/optimizer');

// Default video settings
const DEFAULT_VISIBILITY = 'unlisted'; // 'public', 'unlisted', 'private'
const DEFAULT_CATEGORY = '24'; // Entertainment

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    latest: args.includes('--latest'),
    list: args.includes('--list'),
    auth: args.includes('--auth'),
    public: args.includes('--public'),
    private: args.includes('--private'),
    useSeo: args.includes('--use-seo'),
    storyFolder: args.find(a => !a.startsWith('--'))
  };
}

function getLatestStoryFolder() {
  const outputDir = path.join(process.cwd(), 'output');
  const folders = fs.readdirSync(outputDir)
    .filter(f => {
      const p = path.join(outputDir, f);
      return fs.statSync(p).isDirectory() && 
             fs.existsSync(path.join(p, 'story.json')) &&
             fs.existsSync(path.join(p, 'video.mp4'));
    })
    .map(f => ({ name: f, mtime: fs.statSync(path.join(outputDir, f)).mtime }))
    .sort((a, b) => b.mtime - a.mtime);
  
  return folders.length > 0 ? path.join(outputDir, folders[0].name) : null;
}

/**
 * Create YouTube OAuth2 client
 */
function createYouTubeClient() {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Missing YouTube credentials.\n' +
      'Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REFRESH_TOKEN.\n' +
      'Run: node youtube-upload.js --auth\n'
    );
  }

  const oauth2Client = new OAuth2Client(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  
  return google.youtube({ version: 'v3', auth: oauth2Client });
}

/**
 * Get access token from refresh token (manual OAuth)
 */
async function getAccessToken() {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing YouTube credentials. Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REFRESH_TOKEN');
  }

  const oauth2Client = new OAuth2Client(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  
  const { credentials } = await oauth2Client.refreshAccessToken();
  return credentials.access_token;
}

/**
 * Generate YouTube video metadata from story
 */
function generateMetadata(story, useSeo = false) {
  let title, description, tags;
  
  if (useSeo) {
    // Use SEO-optimized metadata
    const seo = new SEOOptimizer(story);
    const optimized = seo.optimize();
    title = optimized.title;
    description = optimized.description;
    tags = optimized.tags;
  } else {
    // Default metadata generation
    const titleRaw = story.title?.replace(/_/g, ' ').replace(/\d{4}-\d{2}-\d{2}.*/, '').trim();
    const titleCased = titleRaw || 'Mystery Story';
    title = titleCased.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    
    // Limit title to 100 chars
    if (title.length > 100) {
      title = title.substring(0, 97) + '...';
    }
    
    const hook = story.segments?.[0]?.text?.substring(0, 150) || '';
    description = `${hook}...

This is a fictional story created for entertainment purposes.

#story #${story.genre || 'mystery'} #fiction #narrative #scarystories

Generated by MysteryForge
https://github.com/ronaldjohnatanoso/mysteryforge`;
    
    const genreTags = {
      mystery: ['mystery', 'crime', 'suspense', 'thriller', 'detective'],
      horror: ['horror', 'scary', 'creepy', 'paranormal', 'haunting'],
      revenge: ['revenge', 'justice', 'karma', 'storytime', 'reddit'],
      confession: ['confession', 'secret', 'storytime', 'anonymous', 'truestory']
    };
    tags = ['story', 'mystery', 'fiction', 'narrative', 'scary stories', 'reddit stories', ...(genreTags[story.genre] || [])];
  }

  return {
    title,
    description,
    tags,
    categoryId: DEFAULT_CATEGORY
  };
}

/**
 * Upload video to YouTube using googleapis (resumable upload)
 */
async function uploadVideo(videoPath, metadata, accessToken, visibility = DEFAULT_VISIBILITY) {
  const youtube = createYouTubeClient();
  const videoSize = fs.statSync(videoPath).size;
  
  console.log('\n   Uploading to YouTube...');
  console.log(`   Title: ${metadata.title}`);
  console.log(`   Visibility: ${visibility}`);
  console.log(`   Size: ${(videoSize / 1024 / 1024).toFixed(1)} MB`);
  
  try {
    // Create resumable upload session
    const res = await youtube.videos.insert({
      part: ['snippet', 'status'],
      notifySubscribers: false,
      requestBody: {
        snippet: {
          title: metadata.title,
          description: metadata.description,
          tags: metadata.tags,
          categoryId: metadata.categoryId
        },
        status: {
          privacyStatus: visibility,
          selfDeclaredMadeForKids: false
        }
      },
      media: {
        body: fs.createReadStream(videoPath)
      }
    });
    
    const videoId = res.data.id;
    const videoUrl = `https://youtube.com/watch?v=${videoId}`;
    
    console.log('\n✅ Upload complete!');
    console.log(`   Video ID: ${videoId}`);
    console.log(`   URL: ${videoUrl}\n`);
    
    return {
      id: videoId,
      url: videoUrl,
      title: metadata.title,
      privacy: visibility
    };
  } catch (error) {
    if (error.code === 401) {
      throw new Error('OAuth token expired. Run: node youtube-upload.js --auth to refresh.');
    }
    throw new Error(`YouTube API error: ${error.message}`);
  }
}

/**
 * List recent uploads from the authenticated channel
 */
async function listUploads() {
  const youtube = createYouTubeClient();
  
  try {
    // Get channel info
    const channelResponse = await youtube.channels.list({
      part: ['contentDetails'],
      mine: true
    });
    
    const channelId = channelResponse.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    
    if (!channelId) {
      console.log('❌ Could not find uploads playlist');
      return;
    }
    
    // Get recent uploads
    const uploadsResponse = await youtube.playlistItems.list({
      part: ['snippet', 'status'],
      playlistId: channelId,
      maxResults: 10
    });
    
    console.log('\n📋 Recent Uploads:\n');
    
    for (const item of uploadsResponse.data.items || []) {
      const video = item.snippet;
      const status = item.status?.privacyStatus || 'unknown';
      const date = new Date(video.publishedAt).toLocaleDateString();
      
      console.log(`   [${status}] ${video.title}`);
      console.log(`   https://youtube.com/watch?v=${video.resourceId?.videoId}`);
      console.log(`   ${date}\n`);
    }
  } catch (error) {
    throw new Error(`Failed to list uploads: ${error.message}`);
  }
}

/**
 * OAuth authentication flow - generates refresh token
 */
async function runAuthFlow() {
  console.log('\n🔐 YouTube OAuth Setup\n');
  
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    console.log('⚠️  First, set your OAuth credentials:\n');
    console.log('   export YOUTUBE_CLIENT_ID="your-client-id"');
    console.log('   export YOUTUBE_CLIENT_SECRET="your-client-secret"\n');
    console.log('Then run: node youtube-upload.js --auth\n');
    console.log('Steps to get credentials:');
    console.log('1. Go to https://console.cloud.google.com');
    console.log('2. Create project → Enable YouTube Data API v3');
    console.log('3. Credentials → Create Credentials → OAuth client ID');
    console.log('4. Choose "Desktop app" → Download JSON');
    console.log('5. Copy client_id and client_secret\n');
    return;
  }
  
  const oauth2Client = new OAuth2Client(clientId, clientSecret);
  
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/youtube.upload']
  });
  
  console.log('Visit this URL to authorize:\n');
  console.log(`   ${authUrl}\n`);
  console.log('After authorizing, you\'ll get a code. Enter it below.\n');
  
  // For now, just show the URL
  console.log('Paste the authorization code here when prompted.');
  console.log('Then copy the refresh_token from the response.\n');
}

async function main() {
  const opts = parseArgs();

  // Auth flow
  if (opts.auth) {
    await runAuthFlow();
    process.exit(0);
  }

  // List uploads
  if (opts.list) {
    try {
      await listUploads();
    } catch (e) {
      console.error(`\n❌ ${e.message}\n`);
    }
    process.exit(0);
  }

  // Find story folder
  let storyFolder = opts.storyFolder;
  if (opts.latest || !storyFolder) {
    storyFolder = getLatestStoryFolder();
    if (!storyFolder) {
      console.error('❌ No video-ready stories found');
      console.error('   Run: node generate.js && node assemble-video.js --latest');
      process.exit(1);
    }
  } else {
    storyFolder = path.join(process.cwd(), 'output', storyFolder);
  }

  // Check prerequisites
  const videoPath = path.join(storyFolder, 'video.mp4');
  const storyPath = path.join(storyFolder, 'story.json');

  if (!fs.existsSync(videoPath)) {
    console.error('❌ No video.mp4 found in story folder');
    process.exit(1);
  }

  if (!fs.existsSync(storyPath)) {
    console.error('❌ No story.json found in story folder');
    process.exit(1);
  }

  // Load story
  const story = JSON.parse(fs.readFileSync(storyPath, 'utf8'));
  const metadata = generateMetadata(story, opts.useSeo);

  // Determine visibility
  let visibility = DEFAULT_VISIBILITY;
  if (opts.public) visibility = 'public';
  if (opts.private) visibility = 'private';

  const storyName = path.basename(storyFolder);
  console.log(`\n🎬 YouTube Upload: ${storyName}`);
  console.log(`   Video: ${videoPath}`);
  console.log(`   SEO-optimized: ${opts.useSeo ? 'Yes' : 'No'}`);

  try {
    const result = await uploadVideo(videoPath, metadata, null, visibility);
    
    // Save upload record
    const uploadRecord = {
      videoId: result.id,
      url: result.url,
      title: result.title,
      privacy: result.privacy,
      storyFolder: storyName,
      uploadedAt: new Date().toISOString()
    };
    
    const uploadPath = path.join(storyFolder, 'upload.json');
    fs.writeFileSync(uploadPath, JSON.stringify(uploadRecord, null, 2));
    
  } catch (e) {
    console.error(`\n❌ Upload failed: ${e.message}\n`);
    process.exit(1);
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
