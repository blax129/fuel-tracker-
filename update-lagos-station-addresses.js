function stationUpdate(name, brand, area, address, lat, lng) {
  return {
    updateOne: {
      filter: { name, brand },
      update: {
        $set: {
          area,
          fullAddress: address,
          address,
          latitude: lat,
          longitude: lng,
          location: { lat, lng }
        }
      }
    }
  };
}

db.stations.bulkWrite([
  stationUpdate("NNPC Bode Thomas Service Station", "NNPC", "Surulere", "144 Bode Thomas Street, near Eric Moore Road Junction, Surulere, Lagos", 6.5009, 3.3568),
  stationUpdate("Total Adeniran Ogunsanya Service Station", "Total", "Surulere", "72 Adeniran Ogunsanya Street, beside Shoprite Surulere, Lagos", 6.5037, 3.3589),
  stationUpdate("Mobil Aguda Road Service Station", "Mobil", "Surulere", "31 Aguda Road, close to Coker Road Junction, Surulere, Lagos", 6.5093, 3.3498),
  stationUpdate("Conoil Ogunlana Drive Service Station", "Conoil", "Surulere", "88 Ogunlana Drive, by Masha Roundabout, Surulere, Lagos", 6.507, 3.3617),
  stationUpdate("MRS Itire Road Service Station", "MRS", "Surulere", "62 Itire Road, near Lawanson Bus Stop, Surulere, Lagos", 6.512, 3.3445),
  stationUpdate("Oando Eric Moore Service Station", "Oando", "Surulere", "21 Eric Moore Road, opposite National Stadium axis, Surulere, Lagos", 6.4927, 3.3525),
  stationUpdate("Ardova Stadium Road Service Station", "Ardova", "Surulere", "12 Stadium Road, beside Teslim Balogun Stadium, Surulere, Lagos", 6.498, 3.364),

  stationUpdate("Enyo Herbert Macaulay Service Station", "Enyo", "Yaba", "320 Herbert Macaulay Way, near Jibowu Bus Terminal, Yaba, Lagos", 6.5155, 3.3795),
  stationUpdate("NNPC Sabo Yaba Service Station", "NNPC", "Yaba", "18 Commercial Avenue, Sabo Junction, Yaba, Lagos", 6.5201, 3.3781),
  stationUpdate("Total Murtala Muhammed Way Service Station", "Total", "Yaba", "240 Murtala Muhammed Way, by Oyingbo-Yaba corridor, Lagos", 6.5079, 3.3836),
  stationUpdate("Mobil Alagomeji Service Station", "Mobil", "Yaba", "41 Queen Street, Alagomeji, Yaba, Lagos", 6.519, 3.386),
  stationUpdate("Conoil Tejuosho Service Station", "Conoil", "Yaba", "9 Tejuosho Road, opposite Tejuosho Shopping Complex, Yaba, Lagos", 6.516, 3.3712),
  stationUpdate("MRS Onike Service Station", "MRS", "Yaba", "27 Onike Road, beside University of Lagos gate axis, Yaba, Lagos", 6.5228, 3.3904),
  stationUpdate("Oando University Road Service Station", "Oando", "Yaba", "5 University Road, Akoka, close to UNILAG Main Gate, Yaba, Lagos", 6.5184, 3.3973),

  stationUpdate("Ardova Admiralty Way Service Station", "Ardova", "Lekki", "19 Admiralty Way, near Lekki Phase 1 Roundabout, Lagos", 6.4499, 3.4728),
  stationUpdate("Enyo Fola Osibo Service Station", "Enyo", "Lekki", "34 Fola Osibo Road, off Admiralty Way, Lekki Phase 1, Lagos", 6.442, 3.4759),
  stationUpdate("NNPC Chevron Drive Service Station", "NNPC", "Lekki", "12 Chevron Drive, opposite Northern Foreshore Estate, Lekki, Lagos", 6.4367, 3.5355),
  stationUpdate("Total Orchid Road Service Station", "Total", "Lekki", "28 Orchid Road, near Chevron Toll axis, Lekki, Lagos", 6.4563, 3.5429),
  stationUpdate("Mobil Maruwa Lekki Service Station", "Mobil", "Lekki", "Lekki-Epe Expressway, Maruwa Bus Stop inbound lane, Lekki, Lagos", 6.4412, 3.4895),
  stationUpdate("Conoil Jakande Lekki Service Station", "Conoil", "Lekki", "Lekki-Epe Expressway, beside Jakande Roundabout, Lekki, Lagos", 6.432, 3.5067),
  stationUpdate("MRS Ikate Service Station", "MRS", "Lekki", "Ikate-Elegushi Road, close to Circle Mall junction, Lekki, Lagos", 6.4288, 3.4992),
  stationUpdate("Oando Agungi Service Station", "Oando", "Lekki", "Agungi-Ajiran Road, beside Agungi Bus Stop, Lekki, Lagos", 6.4476, 3.521),
  stationUpdate("Ardova Lekki County Service Station", "Ardova", "Lekki", "Lekki County Homes Road, by Ikota Villa Estate gate, Lekki, Lagos", 6.4599, 3.5532),
  stationUpdate("Enyo VGC Service Station", "Enyo", "Lekki", "Lekki-Epe Expressway, opposite VGC Main Gate, Lekki, Lagos", 6.4693, 3.5599),

  stationUpdate("NNPC Ajah Roundabout Service Station", "NNPC", "Ajah", "Lekki-Epe Expressway, beside Ajah Jubilee Bridge Roundabout, Lagos", 6.47, 3.5862),
  stationUpdate("Total Ado Road Service Station", "Total", "Ajah", "14 Ado Road, by Ajah Market junction, Ajah, Lagos", 6.4719, 3.6026),
  stationUpdate("Mobil Abraham Adesanya Service Station", "Mobil", "Ajah", "Abraham Adesanya Estate Road, close to Ogombo Road Junction, Ajah, Lagos", 6.4707, 3.6168),
  stationUpdate("Conoil Badore Road Service Station", "Conoil", "Ajah", "Badore Road, near Cooperative Villa Estate gate, Ajah, Lagos", 6.4868, 3.6055),
  stationUpdate("MRS Sangotedo Service Station", "MRS", "Ajah", "Lekki-Epe Expressway, Sangotedo Market axis, Ajah, Lagos", 6.4712, 3.6386),
  stationUpdate("Oando Langbasa Service Station", "Oando", "Ajah", "Langbasa Road, by Addo-Langbasa Junction, Ajah, Lagos", 6.482, 3.5889),
  stationUpdate("Ardova Thomas Estate Service Station", "Ardova", "Ajah", "Thomas Estate Road, close to Ajah Police Station axis, Ajah, Lagos", 6.4657, 3.6123),

  stationUpdate("Enyo Allen Avenue Service Station", "Enyo", "Ikeja", "47 Allen Avenue, near Allen Roundabout, Ikeja, Lagos", 6.602, 3.3524),
  stationUpdate("NNPC Obafemi Awolowo Way Service Station", "NNPC", "Ikeja", "Obafemi Awolowo Way, beside Ikeja Local Government Secretariat, Lagos", 6.6053, 3.3419),
  stationUpdate("Total Opebi Service Station", "Total", "Ikeja", "69 Opebi Road, close to Salvation Road Junction, Ikeja, Lagos", 6.5889, 3.364),
  stationUpdate("Mobil Toyin Street Service Station", "Mobil", "Ikeja", "33 Toyin Street, near Water Parks junction, Ikeja, Lagos", 6.5965, 3.3568),
  stationUpdate("Conoil Mobolaji Bank Anthony Service Station", "Conoil", "Ikeja", "Mobolaji Bank Anthony Way, opposite Sheraton Hotel axis, Ikeja, Lagos", 6.5786, 3.3599),
  stationUpdate("MRS Adeniyi Jones Service Station", "MRS", "Ikeja", "92 Adeniyi Jones Avenue, beside Wemco Road Junction, Ikeja, Lagos", 6.6122, 3.3492),
  stationUpdate("Oando Agidingbi Service Station", "Oando", "Ikeja", "Agidingbi Road, near Cadbury Head Office, Ikeja, Lagos", 6.6205, 3.3563),
  stationUpdate("Ardova Alausa Service Station", "Ardova", "Ikeja", "Alausa Secretariat Road, opposite Lagos State Secretariat, Ikeja, Lagos", 6.6176, 3.3609),

  stationUpdate("Enyo Maryland Crescent Service Station", "Enyo", "Maryland", "Maryland Crescent, beside Maryland Mall service lane, Lagos", 6.5722, 3.368),
  stationUpdate("NNPC Ikorodu Road Maryland Service Station", "NNPC", "Maryland", "Ikorodu Road, Maryland Bus Stop outbound lane, Lagos", 6.5693, 3.3724),
  stationUpdate("Total Anthony Village Service Station", "Total", "Maryland", "Anthony Village Road, near Anthony Police Station, Maryland, Lagos", 6.562, 3.3709),
  stationUpdate("Mobil Mende Service Station", "Mobil", "Maryland", "Mende Road, close to Maryland Estate gate, Maryland, Lagos", 6.5687, 3.3785),
  stationUpdate("Conoil Shonibare Estate Service Station", "Conoil", "Maryland", "Mobolaji Bank Anthony Way, by Shonibare Estate entrance, Maryland, Lagos", 6.5775, 3.3693),

  stationUpdate("MRS Ojodu Berger Service Station", "MRS", "Ojodu", "Ojodu-Berger Road, beside FRSC Ojodu command, Lagos", 6.6442, 3.3654),
  stationUpdate("Oando Grammar School Road Service Station", "Oando", "Ojodu", "Grammar School Road, near Ojodu Primary Health Centre, Lagos", 6.6388, 3.3589),
  stationUpdate("Ardova Omole Phase 1 Service Station", "Ardova", "Ojodu", "Isheri Road, opposite Omole Phase 1 Estate gate, Ojodu, Lagos", 6.6364, 3.3705),
  stationUpdate("Enyo Akiode Road Service Station", "Enyo", "Ojodu", "Akiode Road, near Ojodu Grammar School, Ojodu, Lagos", 6.6353, 3.3812),
  stationUpdate("NNPC Isheri Road Service Station", "NNPC", "Ojodu", "Isheri-Olowora Road, close to Channels TV Avenue, Ojodu, Lagos", 6.6469, 3.3763),

  stationUpdate("Total Ikorodu Garage Service Station", "Total", "Ikorodu", "Lagos Road, beside Ikorodu Garage Roundabout, Ikorodu, Lagos", 6.62, 3.5077),
  stationUpdate("Mobil Igbogbo Road Service Station", "Mobil", "Ikorodu", "Igbogbo Road, near Benson Bus Stop, Ikorodu, Lagos", 6.6268, 3.5198),
  stationUpdate("Conoil Agric Ikorodu Service Station", "Conoil", "Ikorodu", "Ikorodu Road, Agric Bus Stop inbound lane, Ikorodu, Lagos", 6.6085, 3.4896),
  stationUpdate("MRS Sabo Ikorodu Service Station", "MRS", "Ikorodu", "Sabo Road, opposite Sabo Market entrance, Ikorodu, Lagos", 6.6164, 3.5153),
  stationUpdate("Oando Haruna Service Station", "Oando", "Ikorodu", "Haruna Bus Stop, off Igbogbo Road, Ikorodu, Lagos", 6.6286, 3.5024),
  stationUpdate("Ardova Ebute Ikorodu Service Station", "Ardova", "Ikorodu", "Ebute Road, near Ikorodu Ferry Terminal approach, Ikorodu, Lagos", 6.6148, 3.536),
  stationUpdate("Enyo Odogunyan Service Station", "Enyo", "Ikorodu", "Odogunyan Road, by LASPOTECH First Gate axis, Ikorodu, Lagos", 6.6679, 3.5127),

  stationUpdate("NNPC Festac 22 Road Service Station", "NNPC", "Festac", "22 Road, beside FHA Field, Festac Town, Lagos", 6.4694, 3.2845),
  stationUpdate("Total Festac 1st Avenue Service Station", "Total", "Festac", "1st Avenue, near Festac Access Road junction, Lagos", 6.475, 3.2916),
  stationUpdate("Mobil Festac 4th Avenue Service Station", "Mobil", "Festac", "4th Avenue, opposite Festac Police Station axis, Lagos", 6.4652, 3.2929),
  stationUpdate("Conoil Amuwo Odofin Service Station", "Conoil", "Festac", "Amuwo Odofin Link Road, near 7th Avenue junction, Lagos", 6.4596, 3.2768),
  stationUpdate("MRS Apple Junction Service Station", "MRS", "Festac", "Apple Junction, beside Festac Link Bridge, Amuwo Odofin, Lagos", 6.4629, 3.3125),
  stationUpdate("Oando Mile 2 Service Station", "Oando", "Festac", "Mile 2-Oshodi Expressway service lane, near Festac Link Road, Lagos", 6.4613, 3.3197),

  stationUpdate("Ardova Mushin Road Service Station", "Ardova", "Mushin", "Mushin Road, beside Olosha Market junction, Mushin, Lagos", 6.5289, 3.3528),
  stationUpdate("Enyo Palm Avenue Service Station", "Enyo", "Mushin", "Palm Avenue, near Papa Ajao Roundabout, Mushin, Lagos", 6.5326, 3.3486),
  stationUpdate("NNPC Agege Motor Road Mushin Service Station", "NNPC", "Mushin", "Agege Motor Road, opposite Mushin General Hospital axis, Lagos", 6.5359, 3.3439),
  stationUpdate("Total Ilupeju Bypass Service Station", "Total", "Mushin", "Ilupeju Bypass, near Town Planning Way Junction, Mushin, Lagos", 6.5445, 3.3562),
  stationUpdate("Mobil Ladipo Service Station", "Mobil", "Mushin", "Ladipo Street, by Ladipo Auto Spare Parts Market gate, Mushin, Lagos", 6.5462, 3.3313),
  stationUpdate("Conoil Olateju Street Service Station", "Conoil", "Mushin", "Olateju Street, close to Mushin Market, Mushin, Lagos", 6.5294, 3.3408),

  stationUpdate("MRS Agege Pen Cinema Service Station", "MRS", "Agege", "Pen Cinema Road, beside Pen Cinema Bridge, Agege, Lagos", 6.6218, 3.3255),
  stationUpdate("Oando Dopemu Road Service Station", "Oando", "Agege", "Dopemu Road, near Agege Stadium junction, Agege, Lagos", 6.616, 3.3158),
  stationUpdate("Ardova Capitol Road Service Station", "Ardova", "Agege", "Capitol Road, opposite Agege Local Government Secretariat, Lagos", 6.6274, 3.3297),
  stationUpdate("Enyo Old Abeokuta Road Service Station", "Enyo", "Agege", "Old Abeokuta Road, by Abattoir Bus Stop, Agege, Lagos", 6.6342, 3.3143),
  stationUpdate("NNPC Iju Road Service Station", "NNPC", "Agege", "Iju Road, near Fagba Junction, Agege, Lagos", 6.6369, 3.3366),
  stationUpdate("Total Abule Egba Service Station", "Total", "Agege", "Lagos-Abeokuta Expressway, Abule Egba Underbridge, Lagos", 6.6416, 3.299),

  stationUpdate("Mobil Egbeda Service Station", "Mobil", "Alimosho", "Egbeda-Idimu Road, beside Egbeda Bus Stop, Alimosho, Lagos", 6.5963, 3.2896),
  stationUpdate("Conoil Ikotun Service Station", "Conoil", "Alimosho", "Ikotun-Idimu Road, near Ikotun Roundabout, Alimosho, Lagos", 6.545, 3.2672),
  stationUpdate("MRS Idimu Service Station", "MRS", "Alimosho", "Idimu Road, opposite Council Bus Stop, Alimosho, Lagos", 6.5755, 3.2749),
  stationUpdate("Oando Akowonjo Service Station", "Oando", "Alimosho", "Akowonjo Road, near Vulcanizer Bus Stop, Alimosho, Lagos", 6.6047, 3.2968),
  stationUpdate("Ardova Ipaja Service Station", "Ardova", "Alimosho", "Ipaja Road, beside Command Road Junction, Alimosho, Lagos", 6.6082, 3.2538),
  stationUpdate("Enyo Iyana Ipaja Service Station", "Enyo", "Alimosho", "Lagos-Abeokuta Expressway, Iyana Ipaja Bus Terminal axis, Lagos", 6.6129, 3.2942),
  stationUpdate("NNPC Ayobo Service Station", "NNPC", "Alimosho", "Ayobo-Ipaja Road, near Megida Bus Stop, Alimosho, Lagos", 6.6157, 3.2193),
  stationUpdate("Total Gowon Estate Service Station", "Total", "Alimosho", "41 Road, Gowon Estate, Egbeda, Alimosho, Lagos", 6.5989, 3.2784),

  stationUpdate("Mobil Oshodi Expressway Service Station", "Mobil", "Oshodi", "Apapa-Oshodi Expressway, beside Oshodi Transport Interchange, Lagos", 6.5534, 3.3433),
  stationUpdate("Conoil Bolade Oshodi Service Station", "Conoil", "Oshodi", "Bolade Road, near Oshodi Market entrance, Oshodi, Lagos", 6.5582, 3.3496),
  stationUpdate("MRS Mafoluku Service Station", "MRS", "Oshodi", "Mafoluku Road, close to Ajao Estate Link Bridge, Oshodi, Lagos", 6.5609, 3.3355),
  stationUpdate("Oando Airport Road Oshodi Service Station", "Oando", "Oshodi", "Airport Road, beside NAHCO complex approach, Oshodi, Lagos", 6.5687, 3.3298),
  stationUpdate("Ardova Charity Road Service Station", "Ardova", "Oshodi", "Charity Road, by Oshodi-Isolo Local Government Secretariat axis, Lagos", 6.557, 3.3312),

  stationUpdate("Enyo Berger Bus Stop Service Station", "Enyo", "Berger", "Lagos-Ibadan Expressway, Berger Bus Stop service lane, Lagos", 6.642, 3.3739),
  stationUpdate("NNPC Kara Bridge Service Station", "NNPC", "Berger", "Lagos-Ibadan Expressway, before Kara Bridge inward Lagos, Berger", 6.6505, 3.3846),
  stationUpdate("Total Warewa Road Service Station", "Total", "Berger", "Warewa Road, off Lagos-Ibadan Expressway, Berger axis, Lagos", 6.6608, 3.3915),
  stationUpdate("Mobil Magboro Approach Service Station", "Mobil", "Berger", "Magboro Approach Road, near Berger-Kara corridor, Lagos", 6.6677, 3.399),
  stationUpdate("Conoil New Garage Berger Service Station", "Conoil", "Berger", "New Garage Road, beside Berger pedestrian bridge, Lagos", 6.6379, 3.3678),

  stationUpdate("MRS Gbagada Expressway Service Station", "MRS", "Gbagada", "Gbagada-Oworonshoki Expressway, beside Gbagada General Hospital axis, Lagos", 6.5559, 3.3885),
  stationUpdate("Oando Ifako Gbagada Service Station", "Oando", "Gbagada", "Ifako-Gbagada Road, close to Ifako Market, Gbagada, Lagos", 6.5625, 3.3939),
  stationUpdate("Ardova Diya Street Service Station", "Ardova", "Gbagada", "Diya Street, near Gbagada Phase 2 gate, Lagos", 6.5532, 3.3976),
  stationUpdate("Enyo Pedro Road Service Station", "Enyo", "Gbagada", "Pedro Road, beside Charley Boy Bus Stop, Gbagada, Lagos", 6.548, 3.3912),
  stationUpdate("NNPC Soluyi Service Station", "NNPC", "Gbagada", "Soluyi Road, close to Deeper Life Bible Church headquarters, Gbagada, Lagos", 6.565, 3.4022),
  stationUpdate("Total Deeper Life Road Service Station", "Total", "Gbagada", "Deeper Life Road, opposite Gbagada Phase 1 Estate, Lagos", 6.5595, 3.4057),
  stationUpdate("Mobil Millenium Estate Gbagada Service Station", "Mobil", "Gbagada", "Millenium Estate Road, by Millenium Estate Gate, Gbagada, Lagos", 6.5669, 3.3967),
  stationUpdate("Conoil Phase 2 Gbagada Service Station", "Conoil", "Gbagada", "Gbagada Phase 2 Road, near UPS Junction, Gbagada, Lagos", 6.5518, 3.4039)
]);
