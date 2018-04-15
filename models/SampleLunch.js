var mongoose = require('mongoose');

var sampleLunchSchema = mongoose.Schema({
  title: String,
  image: String,
  description: String,
  allergens: [],
  attributes: [],
  servingSize: String,
  servingSizeMeasurement: String,
  ingredientInfo: String,
  nutrients: {
      calories: String,
      fat_total: String,
      saturated_fat: String,
      trans_fat: String,
      cholesterol: String,
      sodium: String,
      potassium: String,
      potassium_measurement: String,
      potassium_data_missing: String,
      carbohydrates: String,
      fiber: String,
      sugar: String,
      protein: String,
      iron: String,
      iron_measurement: String,
      calcium: String,
      calcium_measurement: String,
      vitamin_a_iu: String,
      vitamin_c: String,
      ash: String,
      serving_weight: String,
      ash_data_missing: Boolean,
      calcium_measurement: String,
      iron_measurement: String,
      vitamin_a_iu_measurement: String,
      vitamin_c_measurement: String,
      vitamin_d: String,
      vitamin_d_measurement: String,
      vitamin_d_data_missing: Boolean
  }
});

module.exports = mongoose.model('SampleLunch', sampleLunchSchema);