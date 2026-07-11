const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    applicationNumber: {
      type: String,
      required: true,
      unique: true,
    },

    studentName: String,
    registerNumber: String,
    institution: String,
    semester: String,
    program: String,
    specialization: String,
    dob: String,
    gender: String,
    phone: String,
    email: String,
    fatherName: String,
    motherName: String,

    accessThrough: String,
    source: String,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Student", studentSchema);