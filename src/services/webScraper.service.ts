import axios from 'axios';
import * as cheerio from 'cheerio';
import logger from '../utils/logger';

export interface ScrapedContent {
  title: string;
  description: string;
  content: string;
  url: string;
  publishDate?: Date;
  author?: string;
  imageUrl?: string;
}

class WebScraperService {
  private readonly USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
  private readonly TIMEOUT = 15000; // 15 seconds

  /**
   * Scrape content from a single URL
   */
  async scrapeUrl(url: string): Promise<ScrapedContent | null> {
    try {
      logger.info(`WebScraperService: Scraping URL: ${url}`);
      
      // Validate URL
      if (!this.isValidUrl(url)) {
        logger.warn(`WebScraperService: Invalid URL: ${url}`);
        return null;
      }

      // Make request with timeout and proper headers
      const response = await axios.get(url, {
        timeout: this.TIMEOUT,
        headers: {
          'User-Agent': this.USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        maxRedirects: 5
      });

      if (response.status !== 200) {
        logger.warn(`WebScraperService: HTTP ${response.status} for URL: ${url}`);
        return null;
      }

      const html = response.data;
      const $ = cheerio.load(html);

      // Extract title
      const title = this.extractTitle($);
      logger.info(`WebScraperService: Extracted title: "${title}" from ${url}`);
      
      // Extract description
      const description = this.extractDescription($);
      logger.info(`WebScraperService: Extracted description (${description.length} chars): "${description.substring(0, 100)}..." from ${url}`);
      
      // Extract main content
      const content = this.extractMainContent($);
      logger.info(`WebScraperService: Extracted content (${content.length} chars): "${content.substring(0, 200)}..." from ${url}`);
      
      // Extract publish date
      const publishDate = this.extractPublishDate($);
      
      // Extract author
      const author = this.extractAuthor($);
      
      // Extract main image
      const imageUrl = this.extractMainImage($, url);

      const scrapedContent: ScrapedContent = {
        title: title || 'Untitled',
        description: description || '',
        content: content || '',
        url,
        publishDate,
        author,
        imageUrl
      };

      logger.info(`WebScraperService: Successfully scraped content from ${url}`, {
        titleLength: scrapedContent.title.length,
        descriptionLength: scrapedContent.description.length,
        contentLength: scrapedContent.content.length
      });

      return scrapedContent;
    } catch (error) {
      logger.error(`WebScraperService: Error scraping URL ${url}`, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Scrape content from multiple URLs
   */
  async scrapeUrls(urls: string[]): Promise<ScrapedContent[]> {
    logger.info(`WebScraperService: Scraping ${urls.length} URLs`);
    
    const promises = urls.map(url => this.scrapeUrl(url));
    const results = await Promise.allSettled(promises);
    
    const scrapedContents: ScrapedContent[] = [];
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        scrapedContents.push(result.value);
      } else {
        logger.warn(`WebScraperService: Failed to scrape URL: ${urls[index]}`);
      }
    });

    logger.info(`WebScraperService: Successfully scraped ${scrapedContents.length} out of ${urls.length} URLs`);
    return scrapedContents;
  }

  /**
   * Generate post content based on scraped data
   */
  generatePostFromScrapedContent(scrapedContents: ScrapedContent[], topic: string): string {
    if (scrapedContents.length === 0) {
      return `Latest updates on ${topic}`;
    }

    let postContent = `📰 **Latest News: ${topic}**\n\n`;

    scrapedContents.forEach((content, index) => {
      if (index > 0) postContent += '\n---\n\n';
      
      postContent += `**${content.title}**\n`;
      
      if (content.description) {
        // Limit description to 200 characters
        const shortDescription = content.description.length > 200 
          ? content.description.substring(0, 197) + '...'
          : content.description;
        postContent += `${shortDescription}\n`;
      }
      
      postContent += `🔗 [Read more](${content.url})`;
      
      if (content.author) {
        postContent += `\n👤 By: ${content.author}`;
      }
    });

    return postContent;
  }

  private isValidUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private extractTitle($: cheerio.CheerioAPI): string {
    // Try multiple selectors for title
    const selectors = [
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
      'title',
      'h1',
      '.title',
      '.post-title',
      '.article-title'
    ];

    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length) {
        const text = selector.includes('meta') 
          ? element.attr('content') 
          : element.text();
        if (text && text.trim()) {
          return text.trim();
        }
      }
    }

    return '';
  }

  private extractDescription($: cheerio.CheerioAPI): string {
    // Try multiple selectors for description
    const selectors = [
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
      'meta[name="description"]',
      '.excerpt',
      '.summary',
      '.description',
      '.lead'
    ];

    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length) {
        const text = selector.includes('meta') 
          ? element.attr('content') 
          : element.text();
        if (text && text.trim()) {
          return text.trim();
        }
      }
    }

    return '';
  }

  private extractMainContent($: cheerio.CheerioAPI): string {
    // Remove unwanted elements
    $('script, style, nav, footer, header, .advertisement, .ads, .sidebar, .related-posts, .comments, .social-share').remove();

    // Try to find main content with priority order
    const contentSelectors = [
      'article',
      '[role="main"]',
      '.post-content',
      '.article-content',
      '.entry-content',
      '.content',
      'main',
      '.main-content',
      '#content',
      '.post-body',
      '.story-body',
      '.article-body'
    ];

    for (const selector of contentSelectors) {
      const element = $(selector).first();
      if (element.length) {
        // Remove nested unwanted elements
        element.find('script, style, .advertisement, .ads, .social-share, .author-bio, .newsletter-signup').remove();
        
        const text = element.text().trim();
        if (text.length > 200) { // Only consider substantial content
          // Clean up the text
          const cleanedText = text
            .replace(/\s+/g, ' ')
            .replace(/\n\s*\n/g, '\n')
            .replace(/[\r\n]+/g, ' ')
            .trim();
          
          if (cleanedText.length > 200) {
            return cleanedText.substring(0, 1500); // Increase limit to 1500 characters
          }
        }
      }
    }

    // Fallback: get all paragraph text
    const paragraphs = $('p');
    let content = '';
    paragraphs.each((_: number, elem: any) => {
      const text = $(elem).text().trim();
      if (text.length > 30) { // Increase minimum length
        content += text + ' ';
      }
    });

    // Clean and return fallback content
    const cleanedContent = content
      .replace(/\s+/g, ' ')
      .trim();
    
    return cleanedContent.substring(0, 1500);
  }

  private extractPublishDate($: cheerio.CheerioAPI): Date | undefined {
    // Try multiple selectors for publish date
    const selectors = [
      'meta[property="article:published_time"]',
      'meta[name="publish_date"]',
      'time[datetime]',
      '.publish-date',
      '.date',
      '.post-date'
    ];

    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length) {
        const dateStr = selector.includes('meta') 
          ? element.attr('content')
          : element.attr('datetime') || element.text();
        
        if (dateStr) {
          const date = new Date(dateStr);
          if (!isNaN(date.getTime())) {
            return date;
          }
        }
      }
    }

    return undefined;
  }

  private extractAuthor($: cheerio.CheerioAPI): string | undefined {
    // Try multiple selectors for author
    const selectors = [
      'meta[property="article:author"]',
      'meta[name="author"]',
      '.author',
      '.post-author',
      '.article-author',
      '[rel="author"]'
    ];

    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length) {
        const text = selector.includes('meta') 
          ? element.attr('content') 
          : element.text();
        if (text && text.trim()) {
          return text.trim();
        }
      }
    }

    return undefined;
  }

  private extractMainImage($: cheerio.CheerioAPI, baseUrl: string): string | undefined {
    // Try multiple selectors for main image
    const selectors = [
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
      '.featured-image img',
      '.post-image img',
      'article img',
      '.content img'
    ];

    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length) {
        const imageUrl = selector.includes('meta') 
          ? element.attr('content')
          : element.attr('src');
        
        if (imageUrl) {
          // Convert relative URLs to absolute
          try {
            return new URL(imageUrl, baseUrl).href;
          } catch {
            // If URL parsing fails, return as-is if it looks like a valid URL
            if (imageUrl.startsWith('http')) {
              return imageUrl;
            }
          }
        }
      }
    }

    return undefined;
  }
}

export default new WebScraperService(); 