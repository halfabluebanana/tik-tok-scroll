const multer = require('multer');
const path = require('path');
const fs = require('fs');

class VideoHandler {
  constructor() {
    this.storage = multer.diskStorage({
      destination: function (req, file, cb) {
        cb(null, 'uploads')
      },
      limits: {
        fileSize: 1000000 * 100 // 100 MB
      },
      fileFilter: function (req, file, callback) {
        var ext = path.extname(file.originalname);
        if(ext !== '.mp4' && ext !== '.mpeg' && ext !== '.webm') {
          return callback(new Error('Only videos are allowed with mp4, mov, mpeg, webm extensions'));
        }
        callback(null, true)
      },
      filename: function (req, file, cb) {
        let newName = file.originalname
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        newName = newName
          .split(' ')
          .join('_')
          .toLowerCase();
        cb(null, Date.now() + '-' + newName)
      },
    });

    this.upload = multer({ storage: this.storage });
  }

  // Get multer middleware for single file upload
  getUploadMiddleware() {
    return this.upload.single('my-video');
  }

  // Handle video upload
  handleUpload(req, res) {
    console.log(`Video uploaded: ${req.file.filename}`);
    res.json({ success: true, filename: req.file.filename });
  }

  // Get most recent files from directory
  getMostRecentFile(dir) {
    try {
      console.log('GETTING RECENT FILESSSSSSSSS')
      const files = this.orderRecentFiles(dir);
      console.log(files);
      return files.length ? [...files].splice(0, 10) : [];
    } catch (error) {
      console.error('Error getting recent files:', error);
      return [];
    }
  }

  // Order files by numeric value in filename
  orderRecentFiles(dir) {
    return fs.readdirSync(dir)
      .filter((file) => fs.lstatSync(path.join(dir, file)).isFile())
      .map((file) => ({ 
        url: `/uploads/${encodeURIComponent(file)}`, 
        filename: file
      }))
      .sort((a, b) => {
        // Extract numbers from filenames (e.g., "vid01" -> 1)
        const numA = parseInt(a.filename.match(/\d+/)?.[0] || '0');
        const numB = parseInt(b.filename.match(/\d+/)?.[0] || '0');
        return numA - numB;
      });
  }

  // Get videos with metadata for API
  getVideosWithMetadata() {
    console.log("GETTING VIDEOS WITH METADATAAAAAA")
        const videos = [
          {
            channel: "What I make for breakfast",
            description: "healthy BLT recipe! 💃 #food #organic",
            song: "Bounce - Ruger",
            likes: 250,
            messages: 120,
            shares: 40,
            url: 'vid00.mp4',
          },
          {
            channel: "Nature is lit",
            description: "#Arizona dust storm 🎵",
            song: "Kolo sound - Nathan",
            likes: 180,
            messages: 95,
            shares: 35,
            url: 'vid01.mp4',

          },
          {
            channel: "What is reality",
            description: "cloud dogs 💛🦋 #viral #dog",
            song: "original sound - KALEI KING 🦋",
            likes: 320,
            messages: 150,
            shares: 60,
            url: 'vid02.mp4',

          },
          {
            channel: "Tropicana",
            description: "spirit moving plants! #weird #plants",
            song: "Dance Floor - DJ Cool",
            likes: 420,
            messages: 180,
            shares: 75,
            url: 'vid03.mp4',

          },
          {
            channel: "TikTTropicana 2r",
            description: "When the beat drops 🎵 #dance #viral",
            song: "Drop It - MC Fresh",
            likes: 550,
            messages: 230,
            shares: 90,
            url: 'vid04.mp4',
          },
          {
            channel: "DanceQueen",
            description: "New moves unlocked! 🔓 #dance #tutorial",
            song: "Rhythm & Flow - Beat Master",
            likes: 380,
            messages: 160,
            shares: 65,
            url: 'vid05.mp4',

          },
          {
            channel: "DanceKing",
            description: "When you nail the choreography 💯 #dance #perfect",
            song: "Move Your Body - Dance Crew",
            likes: 480,
            messages: 200,
            shares: 85,
            url: 'vid06.mp4',

          },
          {
            channel: "DancePro",
            description: "Level up your dance game! 🎮 #dance #skills",
            song: "Game On - DJ Player",
            likes: 520,
            messages: 220,
            shares: 95,
            url: 'vid07.mp4',
          }
        ];

      console.log('returning videos', videos)
      return videos;
  }
}

module.exports = VideoHandler;
