const mongoose = require('mongoose');
const Series = require('../models/Series');
const LongVideo = require('../models/LongVideo');
require('dotenv').config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/strmly';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Recalculate analytics for all series
const recalculateSeriesAnalytics = async () => {
  try {
    console.log('🔄 Starting series analytics recalculation...');
    
    // Get all series with their episodes
    const allSeries = await Series.find({})
      .populate('episodes')
      .lean();
    
    console.log(`📊 Found ${allSeries.length} series to process`);
    
    let updatedCount = 0;
    
    for (const series of allSeries) {
      if (series.episodes && series.episodes.length > 0) {
        // Calculate totals from episodes
        const totalViews = series.episodes.reduce((sum, episode) => sum + (episode.views || 0), 0);
        const totalLikes = series.episodes.reduce((sum, episode) => sum + (episode.likes || 0), 0);
        const totalShares = series.episodes.reduce((sum, episode) => sum + (episode.shares || 0), 0);
        
        // Update the series analytics
        await Series.findByIdAndUpdate(series._id, {
          'analytics.total_views': totalViews,
          'analytics.total_likes': totalLikes,
          'analytics.total_shares': totalShares,
          'analytics.last_analytics_update': new Date()
        });
        
        console.log(`✅ Updated series "${series.title}": ${totalViews} views, ${totalLikes} likes, ${totalShares} shares`);
        updatedCount++;
      } else {
        // Series with no episodes - ensure analytics are zero
        await Series.findByIdAndUpdate(series._id, {
          'analytics.total_views': 0,
          'analytics.total_likes': 0,
          'analytics.total_shares': 0,
          'analytics.last_analytics_update': new Date()
        });
        
        console.log(`✅ Reset analytics for series "${series.title}" (no episodes)`);
        updatedCount++;
      }
    }
    
    console.log(`🎉 Successfully updated analytics for ${updatedCount} series`);
    
  } catch (error) {
    console.error('❌ Error recalculating series analytics:', error);
  }
};

// Main execution
const main = async () => {
  await connectDB();
  await recalculateSeriesAnalytics();
  await mongoose.connection.close();
  console.log('✅ Database connection closed');
  process.exit(0);
};

// Run the script
if (require.main === module) {
  main();
}

module.exports = { recalculateSeriesAnalytics };