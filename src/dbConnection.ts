import mongoose from "mongoose";

/**
 * Opens the MongoDB connection and rethrows on failure so startup can abort
 * instead of running without a database.
 *
 * @param connectionString - MongoDB connection URI.
 */
export const connectDB = async (connectionString: string): Promise<void> => {
  try {
    await mongoose.connect(connectionString);
    console.log(`MongoDB connected successfully!`);
  } catch (error) {
    console.error("MongoDB connection failed!");
    throw error;
  }
};
