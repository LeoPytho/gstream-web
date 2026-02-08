import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import MuxPlayer from "@mux/mux-player-react";
import "../styles/live-stream.css";

function LiveStream() {
  const { playbackId } = useParams();
  const navigate = useNavigate();

  // State untuk verifikasi
  const [isVerified, setIsVerified] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [verificationData, setVerificationData] = useState({
    email: "",
    code: "",
  });
  const [verificationError, setVerificationError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [clientIP, setClientIP] = useState("");

  // State untuk stream
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [streamData, setStreamData] = useState(null);
  const [showInfo, setShowInfo] = useState(null);
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Fungsi untuk mendapatkan IP address client
  const fetchClientIP = async () => {
    try {
      const response = await fetch("https://api.ipify.org?format=json");
      const data = await response.json();
      setClientIP(data.ip);
      return data.ip;
    } catch (error) {
      console.error("Error fetching IP:", error);
      return "unknown";
    }
  };

  // FIXED: Fungsi untuk verifikasi code dengan API
  const verifyAccess = async () => {
    if (!verificationData.email || !verificationData.code) {
      setVerificationError("Email dan code wajib diisi");
      return;
    }

    setVerifying(true);
    setVerificationError("");

    try {
      // Dapatkan IP client
      const ip = clientIP || (await fetchClientIP());

      console.log("Starting verification with:", {
        email: verificationData.email,
        code: verificationData.code,
        ip: ip,
      });

      // Step 1: Verifikasi code menggunakan API verify
      const verifyResponse = await fetch(
        "https://v2.jkt48connect.com/api/codes/verify",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: verificationData.email,
            code: verificationData.code,
            apikey: "JKTCONNECT",
          }),
        }
      );

      const verifyData = await verifyResponse.json();
      console.log("Verify response:", verifyData);

      if (!verifyData.status || !verifyData.data.is_valid) {
        setVerificationError(
          verifyData.message || "Code tidak valid atau sudah kedaluwarsa"
        );
        setVerifying(false);
        return;
      }

      // Step 2: Cek apakah code sudah digunakan dari verify response
      if (verifyData.data.is_used) {
        // Jika sudah digunakan, cek apakah IP sama
        const listResponse = await fetch(
          `https://v2.jkt48connect.com/api/codes/list?email=${verificationData.email}&apikey=JKTCONNECT`
        );
        const listData = await listResponse.json();

        if (listData.status && listData.data.wotatokens) {
          const userCode = listData.data.wotatokens.find(
            (c) => c.code === verificationData.code
          );

          if (userCode) {
            // Cek IP address - DIPERMUDAH: Izinkan jika IP sama ATAU IP belum tercatat
            if (
              userCode.ip_address &&
              userCode.ip_address !== "" &&
              userCode.ip_address !== ip
            ) {
              setVerificationError(
                "Code ini sudah digunakan dari IP address yang berbeda"
              );
              setVerifying(false);
              return;
            }

            // Jika IP sama atau IP belum tercatat, izinkan akses dan simpan session
            const sessionData = {
              email: verificationData.email,
              code: verificationData.code,
              ip: ip,
              timestamp: Date.now(),
              verified: true,
            };
            
            localStorage.setItem("stream_verification", JSON.stringify(sessionData));
            
            setIsVerified(true);
            setShowVerification(false);
            setVerifying(false);
            return;
          }
        }

        setVerificationError("Code sudah digunakan");
        setVerifying(false);
        return;
      }

      // Step 3: Code belum digunakan, gunakan code
      console.log("Code is valid and not used, attempting to use...");

      const useResponse = await fetch(
        "https://v2.jkt48connect.com/api/codes/use",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: verificationData.email,
            code: verificationData.code,
            apikey: "JKTCONNECT",
          }),
        }
      );

      const useData = await useResponse.json();
      console.log("Use response:", useData);

      if (useData.status) {
        // Berhasil menggunakan code - simpan session
        const sessionData = {
          email: verificationData.email,
          code: verificationData.code,
          ip: ip,
          timestamp: Date.now(),
          verified: true,
        };
        
        localStorage.setItem("stream_verification", JSON.stringify(sessionData));
        
        setIsVerified(true);
        setShowVerification(false);
        setVerifying(false);
      } else {
        setVerificationError(useData.message || "Gagal menggunakan code");
        setVerifying(false);
      }
    } catch (error) {
      console.error("Error verifying access:", error);
      setVerificationError(
        "Terjadi kesalahan saat verifikasi. Silakan coba lagi."
      );
      setVerifying(false);
    }
  };

  // FIXED: Fungsi untuk cek verifikasi yang sudah ada (DIPERMUDAH)
  const checkExistingVerification = async () => {
    const stored = localStorage.getItem("stream_verification");
    
    if (!stored) {
      console.log("No stored verification found");
      setShowVerification(true);
      return false;
    }

    try {
      const verificationInfo = JSON.parse(stored);
      
      // Cek apakah ada properti verified dan timestamp
      if (!verificationInfo.verified || !verificationInfo.timestamp) {
        console.log("Invalid verification data structure");
        localStorage.removeItem("stream_verification");
        setShowVerification(true);
        return false;
      }

      // Cek apakah verifikasi masih valid (dalam 5 jam)
      const hoursDiff = (Date.now() - verificationInfo.timestamp) / (1000 * 60 * 60);
      
      if (hoursDiff > 5) {
        console.log("Verification expired (>5 hours)");
        localStorage.removeItem("stream_verification");
        setShowVerification(true);
        return false;
      }

      // PENTING: Tidak perlu verifikasi ulang ke API saat refresh
      // Langsung izinkan akses jika session masih valid
      console.log("Session valid, granting access");
      
      const ip = await fetchClientIP();
      
      // Update IP jika berbeda (untuk handle IP dinamis)
      if (verificationInfo.ip !== ip) {
        console.log("IP changed, updating session");
        verificationInfo.ip = ip;
        localStorage.setItem("stream_verification", JSON.stringify(verificationInfo));
      }
      
      setIsVerified(true);
      setShowVerification(false);
      setVerificationData({
        email: verificationInfo.email,
        code: verificationInfo.code,
      });
      
      return true;

    } catch (error) {
      console.error("Error checking verification:", error);
      localStorage.removeItem("stream_verification");
      setShowVerification(true);
      return false;
    }
  };

  // Fungsi untuk mendapatkan show terdekat dari API
  const fetchNearestShow = async () => {
    try {
      const response = await fetch(
        "https://v2.jkt48connect.com/api/jkt48/theater?apikey=JKTCONNECT"
      );
      const data = await response.json();

      if (data.theater && data.theater.length > 0) {
        const now = new Date();
        let nearestShow = null;
        let smallestDiff = Infinity;

        data.theater.forEach((show) => {
          const showDate = new Date(show.date);
          const diff = Math.abs(showDate - now);

          if (diff < smallestDiff) {
            smallestDiff = diff;
            nearestShow = show;
          }
        });

        return nearestShow;
      }

      return null;
    } catch (error) {
      console.error("Error fetching show data:", error);
      return null;
    }
  };

  // Fungsi untuk mendapatkan lineup member dari API
  const fetchShowMembers = async (showId) => {
    try {
      setLoadingMembers(true);
      const response = await fetch(
        `https://v2.jkt48connect.com/api/jkt48/theater/${showId}?apikey=JKTCONNECT`
      );
      const data = await response.json();

      if (data.shows && data.shows.length > 0 && data.shows[0].members) {
        setMembers(data.shows[0].members);
      }

      setLoadingMembers(false);
    } catch (error) {
      console.error("Error fetching members:", error);
      setLoadingMembers(false);
    }
  };

  // Effect untuk inisialisasi
  useEffect(() => {
    const init = async () => {
      await fetchClientIP();
      const verified = await checkExistingVerification();

      if (verified) {
        loadStreamData();
      } else {
        setLoading(false);
      }
    };

    init();
  }, []);

  // Effect untuk load stream data setelah verifikasi
  useEffect(() => {
    if (isVerified && !streamData) {
      loadStreamData();
    }
  }, [isVerified]);

  const loadStreamData = async () => {
    try {
      setLoading(true);

      if (!playbackId) {
        setError("Playback ID tidak ditemukan");
        setLoading(false);
        return;
      }

      const nearestShow = await fetchNearestShow();

      if (nearestShow) {
        setShowInfo({
          title: nearestShow.title,
          showId: nearestShow.id,
        });
        await fetchShowMembers(nearestShow.id);
      }

      setTimeout(() => {
        setStreamData({
          playbackId: playbackId,
          title: nearestShow ? nearestShow.title : "Live Stream JKT48",
          viewerId: "viewer-" + Date.now(),
        });
        setLoading(false);
      }, 500);
    } catch (error) {
      console.error("Error loading stream:", error);
      setError("Terjadi kesalahan saat memuat stream. Silakan coba lagi.");
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setVerificationData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setVerificationError("");
  };

  const handleVerificationSubmit = (e) => {
    e.preventDefault();
    verifyAccess();
  };

  const goBack = () => {
    navigate(-1);
  };

  const handleLogout = () => {
    localStorage.removeItem("stream_verification");
    setIsVerified(false);
    setShowVerification(true);
    setStreamData(null);
    setVerificationData({ email: "", code: "" });
  };

  // Tampilan Verifikasi
  if (showVerification && !isVerified) {
    return (
      <div className="verification-page">
        <div className="verification-container">
          <div className="verification-card">
            <h1>🔐 Verifikasi Akses</h1>
            <p>Masukkan email dan code untuk mengakses live stream</p>

            <form onSubmit={handleVerificationSubmit}>
              <div className="form-group">
                <label>📧 Email</label>
                <input
                  type="email"
                  name="email"
                  value={verificationData.email}
                  onChange={handleInputChange}
                  placeholder="email@example.com"
                  required
                />
              </div>

              <div className="form-group">
                <label>🔑 Verification Code</label>
                <input
                  type="text"
                  name="code"
                  value={verificationData.code}
                  onChange={handleInputChange}
                  placeholder="Masukkan code"
                  required
                />
              </div>

              {verificationError && (
                <div className="error-message">
                  ⚠️ {verificationError}
                </div>
              )}

              {verifying ? (
                <>
                  <button type="button" className="verify-button" disabled>
                    <span className="spinner"></span>
                    Memverifikasi...
                  </button>
                </>
              ) : (
                <>
                  <button type="submit" className="verify-button">
                    ✓ Verifikasi Akses
                  </button>
                </>
              )}
            </form>

            <div className="verification-info">
              <p>ℹ️ <strong>Informasi:</strong></p>
              <ul>
                <li>Code verifikasi hanya dapat digunakan sekali</li>
                <li>IP address akan dicatat untuk keamanan</li>
                <li>Akses berlaku selama 5 jam</li>
                <li>Session tetap aktif saat refresh halaman</li>
              </ul>
            </div>

            <button onClick={goBack} className="back-button">
              ← Kembali
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Tampilan Loading
  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-content">
          <div className="spinner-large"></div>
          <h2>Memuat live stream...</h2>
          <p>Mengambil informasi show...</p>
        </div>
      </div>
    );
  }

  // Tampilan Error
  if (error || !streamData) {
    return (
      <div className="error-container">
        <div className="error-content">
          <div className="error-icon">⚠️</div>
          <h2>Terjadi Kesalahan</h2>
          <p>{error || "Tidak dapat memuat live stream"}</p>
          <button onClick={goBack} className="back-button">
            ← Kembali
          </button>
        </div>
      </div>
    );
  }

  // Tampilan Stream (setelah verifikasi berhasil)
  return (
    <div className="live-stream-page">
      {/* Header */}
      <div className="stream-header">
        <button onClick={goBack} className="back-btn">
          ← Kembali
        </button>

        {showInfo && (
          <div className="show-title">
            <span>🎭 {showInfo.title}</span>
          </div>
        )}

        <button onClick={handleLogout} className="logout-btn">
          🚪 Logout
        </button>
      </div>

      {/* Player Container */}
      <div className="player-container">
        <MuxPlayer
          streamType="live"
          playbackId={streamData.playbackId}
          metadata={{
            video_title: streamData.title,
            viewer_user_id: streamData.viewerId,
          }}
          autoPlay
        />
      </div>

      {/* Lineup Members Section */}
      {members.length > 0 && (
        <div className="members-section">
          <div className="members-header">
            <h3>👥 Lineup Show</h3>
            <span className="member-count">{members.length} Member</span>
          </div>

          {loadingMembers ? (
            <div className="members-loading">
              <div className="spinner"></div>
              <p>Memuat lineup...</p>
            </div>
          ) : (
            <div className="members-grid">
              {members.map((member) => (
                <div key={member.id} className="member-card">
                  <img src={member.img} alt={member.name} />
                  <p>{member.name}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="stream-footer">
        <p>POWERED BY JKT48Connect</p>
      </div>
    </div>
  );
}

export default LiveStream;
