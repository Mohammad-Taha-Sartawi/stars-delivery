const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

const IMGBB_UPLOAD_ENABLED =
  process.env.ENABLE_IMGBB_UPLOAD === 'true';
const IMGBB_API_KEY = IMGBB_UPLOAD_ENABLED
  ? process.env.IMGBB_API_KEY
  : '';

async function uploadToCloud(imagePath) {
  if (!IMGBB_API_KEY) return null;

  try {
    const form = new FormData();
    form.append('image', fs.createReadStream(imagePath));

    const res = await axios.post('https://api.imgbb.com/1/upload', form, {
      params: { key: IMGBB_API_KEY },
      headers: form.getHeaders(),
      timeout: 15000,
    });

    if (res.data?.success) {
      return res.data.data.url;
    }
    return null;
  } catch (err) {
    console.error('ImgBB upload failed:', err.message);
    return null;
  }
}

async function uploadImagesToCloud(filePaths) {
  const paths = Array.isArray(filePaths) ? filePaths : [];

  // Keep one result slot per input file. The previous implementation
  // dropped failures, which could attach the wrong cloud URL to a file.
  return Promise.all(
    paths.map((filePath) => uploadToCloud(filePath)),
  );
}

module.exports = {
  IMGBB_UPLOAD_ENABLED,
  uploadToCloud,
  uploadImagesToCloud,
};
