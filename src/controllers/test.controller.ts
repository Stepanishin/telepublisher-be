import { Request, Response } from 'express';
import webScraperService from '../services/webScraper.service';
import logger from '../utils/logger';

/**
 * Test web scraping functionality
 */
export const testWebScraping = async (req: Request, res: Response): Promise<void> => {
  try {
    const { urls } = req.body;
    
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Please provide an array of URLs to test'
      });
      return;
    }

    logger.info(`Testing web scraping for ${urls.length} URLs`);
    
    const results = await webScraperService.scrapeUrls(urls);
    
    res.status(200).json({
      success: true,
      data: {
        totalUrls: urls.length,
        successfulScrapes: results.length,
        results: results.map(result => ({
          url: result.url,
          title: result.title,
          descriptionLength: result.description.length,
          contentLength: result.content.length,
          hasAuthor: !!result.author,
          hasPublishDate: !!result.publishDate,
          hasImage: !!result.imageUrl
        })),
        detailedResults: results
      }
    });
  } catch (error) {
    logger.error('Error testing web scraping:', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({
      success: false,
      message: 'Failed to test web scraping',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}; 