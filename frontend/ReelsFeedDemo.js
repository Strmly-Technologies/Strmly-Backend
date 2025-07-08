import React, { useEffect, useState } from "react";
import axios from "axios";

const API_BASE = "http://localhost:3001/api/v1";

function Reel({ video, token }) {
  const [access, setAccess] = useState(null);
  const [streamUrl, setStreamUrl] = useState(null);

  const checkAccess = async () => {
    setAccess(null);
    setStreamUrl(null);
    try {
      const res = await axios.get(
        `${API_BASE}/videos/${video._id}/access-check?type=long`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setAccess(res.data);
      if (res.data.hasAccess) {
        const streamRes = await axios.get(
          `${API_BASE}/videos/${video._id}/stream?type=long`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setStreamUrl(streamRes.data.streamData.videoUrl);
      }
    } catch (e) {
      setAccess({ error: "Access check failed" });
    }
  };

  return (
    <div style={{ border: "1px solid #ccc", margin: 16, padding: 16 }}>
      <h3>{video.name}</h3>
      <p>By: {video.creator?.username}</p>
      <button onClick={checkAccess}>Watch</button>
      {access && !access.hasAccess && (
        <div>
          <p>This is a paid video.</p>
          <ul>
            {access.paymentOptions?.map((opt) => (
              <li key={opt.type}>
                {opt.description} {opt.price && `- ₹${opt.price}`}
              </li>
            ))}
          </ul>
        </div>
      )}
      {streamUrl && (
        <video src={streamUrl} controls width={320} autoPlay />
      )}
      {access?.error && <div style={{ color: "red" }}>{access.error}</div>}
    </div>
  );
}

export default function ReelsFeedDemo({ token }) {
  const [videos, setVideos] = useState([]);

  useEffect(() => {
    // Fetch feed videos (replace with your actual feed endpoint)
    axios
      .get(`${API_BASE}/user/feed`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setVideos(res.data.feed || []));
  }, [token]);

  return (
    <div>
      <h2>Reels Feed Demo</h2>
      {videos.map((video) => (
        <Reel key={video._id} video={video} token={token} />
      ))}
    </div>
  );
}
