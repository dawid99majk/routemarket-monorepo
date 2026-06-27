const payload = {
  messages: [
    { role: "user", text: "Zrób mi trasę w Tatrach" }
  ],
  vehicle_type: "hiking",
  bike_subtype: "gravel",
  routing_preference: "popular"
};

fetch("https://route-builder-api-758292493673.europe-west1.run.app/chat-interview", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload)
}).then(res => res.json()).then(data => {
  console.log(JSON.stringify(data, null, 2));
}).catch(err => {
  console.error(err);
});
