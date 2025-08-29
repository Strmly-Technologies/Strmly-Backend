/**
 * Script to clean up orphaned records in the database
 * This fixes issues where videos have null created_by references
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const LongVideo = require('../models/LongVideo');
const Reshare = require('../models/Reshare');
const User = require('../models/User');

async function cleanupOrphanedRecords() {
  try {
    console.log('🔧 Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to database');

    // 1. Find videos with null or missing created_by
    console.log('\n📹 Checking for videos with null created_by...');
    const videosWithNullCreator = await LongVideo.find({
      $or: [
        { created_by: null },
        { created_by: { $exists: false } }
      ]
    });

    console.log(`Found ${videosWithNullCreator.length} videos with null created_by`);

    if (videosWithNullCreator.length > 0) {
      console.log('Sample videos with null created_by:');
      videosWithNullCreator.slice(0, 5).forEach(video => {
        console.log(`  - ${video._id}: ${video.name || 'Unnamed'}`);
      });

      // Option 1: Delete these videos (uncomment if you want to delete them)
      // const deleteResult = await LongVideo.deleteMany({
      //   $or: [
      //     { created_by: null },
      //     { created_by: { $exists: false } }
      //   ]
      // });
      // console.log(`🗑️ Deleted ${deleteResult.deletedCount} videos with null created_by`);

      // Option 2: Set a default user (safer approach)
      const defaultUser = await User.findOne().sort({ createdAt: 1 });
      if (defaultUser) {
        const updateResult = await LongVideo.updateMany(
          {
            $or: [
              { created_by: null },
              { created_by: { $exists: false } }
            ]
          },
          { created_by: defaultUser._id }
        );
        console.log(`🔧 Updated ${updateResult.modifiedCount} videos to use default user: ${defaultUser.username}`);
      }
    }

    // 2. Find reshares with null or missing long_video
    console.log('\n🔄 Checking for reshares with null long_video...');
    const resharesWithNullVideo = await Reshare.find({
      $or: [
        { long_video: null },
        { long_video: { $exists: false } }
      ]
    });

    console.log(`Found ${resharesWithNullVideo.length} reshares with null long_video`);

    if (resharesWithNullVideo.length > 0) {
      // Delete orphaned reshares
      const deleteResult = await Reshare.deleteMany({
        $or: [
          { long_video: null },
          { long_video: { $exists: false } }
        ]
      });
      console.log(`🗑️ Deleted ${deleteResult.deletedCount} orphaned reshares`);
    }

    // 3. Find reshares pointing to non-existent videos
    console.log('\n🔍 Checking for reshares pointing to deleted videos...');
    const allReshares = await Reshare.find({}).populate('long_video');
    const orphanedReshares = allReshares.filter(reshare => !reshare.long_video);

    console.log(`Found ${orphanedReshares.length} reshares pointing to deleted videos`);

    if (orphanedReshares.length > 0) {
      const orphanedIds = orphanedReshares.map(r => r._id);
      const deleteResult = await Reshare.deleteMany({ _id: { $in: orphanedIds } });
      console.log(`🗑️ Deleted ${deleteResult.deletedCount} orphaned reshares`);
    }

    console.log('\n✅ Database cleanup completed!');

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from database');
  }
}

// Run the cleanup
if (require.main === module) {
  cleanupOrphanedRecords();
}

module.exports = cleanupOrphanedRecords;