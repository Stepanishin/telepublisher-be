import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

// Convert callback-based fs functions to Promise-based
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const unlink = promisify(fs.unlink);
const readFile = promisify(fs.readFile);

// Path to the uploads folder
const uploadsDir = path.join(__dirname, '../../uploads');
const metadataDir = path.join(uploadsDir, '.metadata');

// Calculate the cutoff date (7 days ago)
const getExpirationDate = (): Date => {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date;
};

/**
 * Gets the creation date of an image using its timestamp file if available,
 * otherwise falls back to the file's mtime
 * @param filename The image filename
 * @param fileStat The file's stat object containing mtime
 * @returns The creation date of the file
 */
const getImageCreationDate = async (filename: string, fileStat: fs.Stats): Promise<Date> => {
  try {
    // Check if we have a timestamp file for this image
    const timestampPath = path.join(metadataDir, `${filename}.meta`);
    if (fs.existsSync(timestampPath)) {
      const timestamp = await readFile(timestampPath, 'utf8');
      const creationDate = new Date(timestamp);
      return creationDate;
    }
  } catch (error) {
    console.error(`Error reading timestamp for ${filename}, falling back to mtime:`, error);
  }
  
  // Fall back to file modification time if no timestamp or error
  return fileStat.mtime;
};

/**
 * Delete files older than 7 days from the main uploads folder
 * This only targets the main uploads folder and ignores the drafts folder
 */
export const cleanupOldImages = async (): Promise<void> => {
  try {
    // Make sure the uploads directory exists
    if (!fs.existsSync(uploadsDir)) {
      console.log('Uploads directory does not exist. Nothing to clean up.');
      return;
    }

    console.log('Starting cleanup of old images...');
    
    // Get all files in uploads directory (excluding subdirectories)
    const files = await readdir(uploadsDir);
    const cutoffDate = getExpirationDate();
    let deletedCount = 0;
    
    // Process each file
    for (const file of files) {
      try {
        // Skip directories (like the drafts folder) and metadata directory
        const filePath = path.join(uploadsDir, file);
        const fileStat = await stat(filePath);
        
        if (fileStat.isDirectory() || file === '.metadata') {
          continue;
        }
        
        // Get the creation date of the image (either from timestamp or mtime)
        const creationDate = await getImageCreationDate(file, fileStat);
        
        // Check if the file is older than the cutoff date
        if (creationDate < cutoffDate) {
          await unlink(filePath);
          deletedCount++;
          console.log(`Deleted old image: ${file}`);
          
          // Also clean up the timestamp file if it exists
          const timestampPath = path.join(metadataDir, `${file}.meta`);
          if (fs.existsSync(timestampPath)) {
            await unlink(timestampPath);
            console.log(`Deleted timestamp file for: ${file}`);
          }
        }
      } catch (fileError) {
        console.error(`Error processing file ${file}:`, fileError);
      }
    }
    
    console.log(`Cleanup completed. Deleted ${deletedCount} old images.`);
  } catch (error) {
    console.error('Error during image cleanup:', error);
  }
}; 