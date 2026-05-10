db.stations.updateMany(
  {},
  [
    {
      $set: {
        fullAddress: { $ifNull: ["$fullAddress", "$address"] },
        latitude: { $ifNull: ["$latitude", { $ifNull: ["$location.lat", "$location.latitude"] }] },
        longitude: { $ifNull: ["$longitude", { $ifNull: ["$location.lng", "$location.longitude"] }] },
        fuelAvailable: { $ifNull: ["$fuelAvailable", null] },
        price: { $ifNull: ["$price", null] },
        lastUpdated: { $ifNull: ["$lastUpdated", null] }
      }
    }
  ]
);
