require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const {
  isValidPublicId,
  generatePublicId,
} = require('../utils/publicId');

async function regeneratePublicIds({ apply, all }) {
  await mongoose.connect(process.env.MONGODB_URI);

  const users = await User.find({
    role: { $in: ['customer', 'provider'] },
  })
    .select('_id fullName role publicId')
    .lean();

  let needsChange = 0;
  let changed = 0;

  for (const user of users) {
    const current = user.publicId || '';
    if (!all && isValidPublicId(current)) continue;

    needsChange += 1;

    if (!apply) {
      console.log(
        `${user.role} ${user._id} ${user.fullName}: ${current || '(missing)'} -> (new ID)`,
      );
      continue;
    }

    const nextId = await generatePublicId();
    await User.updateOne(
      { _id: user._id },
      { $set: { publicId: nextId } },
    );
    changed += 1;
  }

  console.log(JSON.stringify({
    apply,
    all,
    users: users.length,
    needsChange,
    changed,
  }, null, 2));

  await mongoose.disconnect();
}

const apply = process.argv.includes('--apply');
const all = process.argv.includes('--all');

regeneratePublicIds({ apply, all }).catch(async (error) => {
  console.error(error);
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  process.exit(1);
});
