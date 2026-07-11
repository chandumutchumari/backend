const { getProfileData } = require("../services/profileService");

exports.getProfile = async (_req, res) => {
  try {
    const data = await getProfileData();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to load profile" });
  }
};