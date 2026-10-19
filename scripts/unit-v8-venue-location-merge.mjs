  const savedBeijing = { ...selected, city: "北京", venue: "Court 3" };
  assert.equal(sameVenueCity("北京", " 北京市 "), true, "city suffix and whitespace are equivalent");
  assert.equal(sameVenueCity("北京", "上海"), false, "different cities are not equivalent");
  const sameCity = resetVenueOnCityChange(savedBeijing, " 北京市 ");
  assert.equal(sameCity.venue_place_id, "new-poi", "same city must preserve the saved POI");
  assert.equal(sameCity.venue, "Court 3", "same city must preserve specific court text");
  const changedCity = resetVenueOnCityChange(savedBeijing, "上海");
  for (const field of ["venue", "venue_name", "venue_address", "venue_latitude", "venue_longitude", "venue_place_id", "venue_provider"]) {
    assert.equal(changedCity[field], null, `${field} must be cleared when the event city changes`);
  }
  assert.equal(changedCity.city, "上海");
  assert.equal(changedCity.name, savedBeijing.name, "other event fields remain untouched");
  assert.equal(savedBeijing.venue_place_id, "new-poi", "reset must not mutate the prior state");
  const clearedCity = resetVenueOnCityChange(savedBeijing, null);
  assert.equal(clearedCity.venue_latitude, null, "clearing the city also invalidates old coordinates");
  const formSource = await readFile("src/pages/EventFormPage.tsx", "utf8");
  assert.match(formSource, /if\(k==="city"\)Object\.assign\(next,resetVenueOnCityChange\(f,v as EventConfig\["city"\]\)\)/,
    "the event city input must invalidate stale venue data");
  assert.match(formSource, /sameVenueCity\(f\.city,requestedCity\)\?mergeVenueLocation\(f,location,place,"device"\):f/,
    "an in-flight GPS lookup from the previous city must not restore its old venue");
