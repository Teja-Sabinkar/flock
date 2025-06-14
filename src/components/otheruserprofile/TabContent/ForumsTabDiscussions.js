'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import styles from './ForumsTabDiscussions.module.css';
import { ReportModal, submitReport } from '@/components/report';
import { useRouter } from 'next/navigation';
import ShareModal from '@/components/share/ShareModal';
import PostSaveModal from '@/components/home/PostSaveModal';

// Helper function to format date to "time ago" format
const formatTimeAgo = (dateString) => {
  if (!dateString) return 'recently';

  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  // Time intervals in seconds
  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60
  };

  let counter;
  for (const [unit, secondsInUnit] of Object.entries(intervals)) {
    counter = Math.floor(seconds / secondsInUnit);
    if (counter > 0) {
      return `${counter} ${unit}${counter !== 1 ? 's' : ''} ago`;
    }
  }

  return 'just now';
};

// Helper function for generating colors from usernames - moved outside so UserAvatar can use it
const generateColorFromUsername = (username) => {
  if (!username) return '#3b5fe2'; // Default blue color

  // Simple hash function for consistent color generation
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Convert hash to a hex color
  let color = '#';
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xFF;
    color += ('00' + value.toString(16)).substr(-2);
  }

  return color;
};

// NEW: Function to fetch comment counts for posts
const fetchCommentCounts = async (postsArray) => {
  try {
    const token = localStorage.getItem('token');
    if (!token) return postsArray;

    // Create an array of promises to fetch comment counts for each post
    const commentCountPromises = postsArray.map(async (post) => {
      try {
        const postId = post.id || post._id;
        const response = await fetch(`/api/posts/${postId}/comments`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
          const commentsData = await response.json();
          // Count total comments including nested replies
          const totalComments = countTotalComments(commentsData.comments || []);
          return {
            ...post,
            commentCount: totalComments
          };
        } else {
          console.warn(`Failed to fetch comments for post ${postId}`);
          return {
            ...post,
            commentCount: 0
          };
        }
      } catch (error) {
        console.error(`Error fetching comments for post ${post.id || post._id}:`, error);
        return {
          ...post,
          commentCount: 0
        };
      }
    });

    // Wait for all comment count fetches to complete
    const postsWithCommentCounts = await Promise.all(commentCountPromises);
    return postsWithCommentCounts;
  } catch (error) {
    console.error('Error fetching comment counts:', error);
    return postsArray;
  }
};

// NEW: Helper function to count total comments including nested replies
const countTotalComments = (comments) => {
  let total = 0;
  
  const countReplies = (commentArray) => {
    commentArray.forEach(comment => {
      total++;
      if (comment.replies && comment.replies.length > 0) {
        countReplies(comment.replies);
      }
    });
  };
  
  countReplies(comments);
  return total;
};

// New UserAvatar component for fetching and displaying user avatars
const UserAvatar = ({ username }) => {
  const [profilePic, setProfilePic] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        const response = await fetch(`/api/users/${encodeURIComponent(username)}`, {
          headers
        });

        if (response.ok) {
          const userData = await response.json();
          if (userData.profilePicture &&
            userData.profilePicture !== '/profile-placeholder.jpg') {
            setProfilePic(userData.profilePicture);
          }
        }
      } catch (error) {
        console.error('Error fetching user profile:', error);
      } finally {
        setLoading(false);
      }
    };

    if (username) {
      fetchUserProfile();
    }
  }, [username]);

  if (loading) {
    return (
      <div
        className={styles.avatarPlaceholder}
        style={{ backgroundColor: generateColorFromUsername(username) }}
      >
        <span className={styles.avatarInitial}>
          {username ? username.charAt(0).toUpperCase() : 'U'}
        </span>
      </div>
    );
  }

  if (profilePic) {
    return (
      <Image
        src={profilePic}
        alt={`${username}'s avatar`}
        width={40}
        height={40}
        className={styles.avatarImage}
        priority
        unoptimized
        key={profilePic} // Force re-render when URL changes
      />
    );
  }

  return (
    <div
      className={styles.avatarPlaceholder}
      style={{ backgroundColor: generateColorFromUsername(username) }}
    >
      <span className={styles.avatarInitial}>
        {username ? username.charAt(0).toUpperCase() : 'U'}
      </span>
    </div>
  );
};

const DiscussionPost = ({ post, onHidePost }) => {
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [hideSuccess, setHideSuccess] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [reportContent, setReportContent] = useState(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const menuRef = useRef(null);

  // Video playback states
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [videoId, setVideoId] = useState(null);
  const [videoError, setVideoError] = useState(false);

  // Extract YouTube video ID from URL
  const extractYouTubeVideoId = useCallback((url) => {
    if (!url || typeof url !== 'string') return null;

    try {
      // Comprehensive regex that handles all YouTube URL formats
      const youtubeRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
      const match = url.match(youtubeRegex);
      return match && match[1] ? match[1] : null;
    } catch (error) {
      console.error('Error extracting video ID:', error);
      return null;
    }
  }, []);

  // Track view engagement with the post
  const trackViewEngagement = async (postId) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch(`/api/posts/${postId}/track-view`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.warn('Failed to track view engagement');
      } else {
        const data = await response.json();
        console.log('View engagement tracked:', data);
      }
    } catch (error) {
      console.error('Error tracking view engagement:', error);
    }
  };

  // Extract video ID when component mounts or videoUrl changes
  useEffect(() => {
    if (post.videoUrl) {
      const id = extractYouTubeVideoId(post.videoUrl);
      setVideoId(id);
    } else {
      setVideoId(null);
    }
  }, [post.videoUrl, extractYouTubeVideoId]);

  // Handle play button click - WITH VIEW TRACKING
  const handlePlayClick = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (videoId) {
      setIsVideoPlaying(true);
      setVideoError(false);

      // Track view engagement when play button is clicked
      const postId = post.id || post._id;
      await trackViewEngagement(postId);
    }
  }, [videoId, post.id, post._id]);

  // Handle closing video (return to thumbnail)
  const handleCloseVideo = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsVideoPlaying(false);
    setVideoError(false);
  }, []);

  // Handle video embedding error
  const handleVideoError = useCallback(() => {
    setVideoError(true);
  }, []);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  // Menu option handlers
  const handleHide = async () => {
    setIsMenuOpen(false);

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        alert('Please log in to hide posts');
        return;
      }

      // Call API to hide the post
      const response = await fetch('/api/posts/hide', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ postId: post.id || post._id })
      });

      if (!response.ok) {
        throw new Error('Failed to hide post');
      }

      // Show success message temporarily
      setHideSuccess(true);
      setTimeout(() => {
        setHideSuccess(false);

        // Call the parent function to remove this post from UI
        if (onHidePost) {
          onHidePost(post.id || post._id);
        }
      }, 1500);

    } catch (error) {
      console.error('Error hiding post:', error);
      alert('Failed to hide post. Please try again.');
    }
  };

  const handleReport = () => {
    setIsMenuOpen(false);
    setReportContent(post);
    setIsReportModalOpen(true);
  };

  const handleSave = (e) => {
    e.stopPropagation();
    setIsMenuOpen(false);
    setIsSaveModalOpen(true);
  };

  const handleReportSubmit = async (reportData) => {
    try {
      await submitReport(reportData);
      setIsReportModalOpen(false);
      setReportSuccess(true);

      // Hide success message after 3 seconds
      setTimeout(() => {
        setReportSuccess(false);
      }, 3000);
    } catch (error) {
      console.error('Error submitting report:', error);
      alert('Failed to submit report. Please try again.');
    }
  };

  const handleDiscussionClick = () => {
    const postId = post.id || post._id;
    router.push(`/discussion?id=${postId}`);
  };

  const handleShare = () => {
    setIsShareModalOpen(true);
  };

  return (
    <div className={styles.postCard}>
      <div className={styles.postHeader}>
        <div className={styles.userInfo}>
          <div className={styles.avatarContainer}>
            <UserAvatar username={post.username} />
          </div>
          <div className={styles.nameDate}>
            <div className={styles.usernameLine}>
              <Link href={`/otheruserprofile/${post.username}`} className={styles.username}>
                {post.username}
              </Link>
            </div>
            <span className={styles.postDate}>
              {post.timeAgo || formatTimeAgo(post.createdAt) || 'recently'}
            </span>
          </div>
        </div>

        <div className={styles.menuContainer} ref={menuRef}>
          <button
            className={styles.postMenu}
            aria-label="Post menu"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="1"></circle>
              <circle cx="12" cy="5" r="1"></circle>
              <circle cx="12" cy="19" r="1"></circle>
            </svg>
          </button>

          {isMenuOpen && (
            <div className={styles.dropdown}>
              <button
                className={styles.dropdownItem}
                onClick={handleSave}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                  <polyline points="17 21 17 13 7 13 7 21"></polyline>
                  <polyline points="7 3 7 8 15 8"></polyline>
                </svg>
                <span>Save</span>
              </button>
              <button
                className={styles.dropdownItem}
                onClick={handleHide}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
                <span>Hide</span>
              </button>
              <button
                className={styles.dropdownItem}
                onClick={handleReport}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                <span>Report</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <h2 className={styles.postTitle}>{post.title}</h2>
      <p className={styles.postDescription}>{post.content || post.description}</p>

      {/* Post Image/Video Container with Video Player Support */}
      <div className={styles.postImageContainer}>
        {isVideoPlaying && videoId && !videoError ? (
          // YouTube video player
          <div className={styles.videoPlayerWrapper}>
            <button
              className={styles.closeVideoButton}
              onClick={handleCloseVideo}
              aria-label="Close video"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <iframe
              className={styles.youtubeEmbed}
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
              title={post.title}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              onError={handleVideoError}
            ></iframe>
          </div>
        ) : isVideoPlaying && videoError ? (
          // Error fallback when embedding fails
          <div className={styles.videoErrorContainer}>
            <button
              className={styles.closeVideoButton}
              onClick={handleCloseVideo}
              aria-label="Close video"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <div className={styles.videoErrorContent}>
              <div className={styles.errorIcon}>
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              </div>
              <h3>Video cannot be embedded</h3>
              <p>This video cannot be played directly. Click below to watch on YouTube.</p>
              <a
                href={post.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.watchOnYoutubeBtn}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                Watch on YouTube
              </a>
            </div>
          </div>
        ) : post.image ? (
          // Thumbnail with optional play button
          <div className={styles.postImageWrapper}>
            <Image
              src={post.image}
              alt={post.title}
              width={600}
              height={300}
              className={styles.postImage}
              unoptimized
              priority
              key={`forum-discussion-image-${post.id || post._id}-${post.image}`}
            />

            {/* Play button overlay for videos */}
            {post.videoUrl && videoId && (
              <button
                className={styles.playButton}
                onClick={handlePlayClick}
                aria-label="Play video"
              >
                <div className={styles.playButtonCircle}>
                  <svg
                    className={styles.playIcon}
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </button>
            )}
          </div>
        ) : null}
      </div>

      <div className={styles.postEngagement}>
        <button
          className={styles.commentsBtn}
          onClick={handleDiscussionClick}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
          </svg>
          {/* UPDATED: Display actual comment count with fallbacks, similar to Post component */}
          <span>
            {post.commentCount?.toString() || post.discussions?.toString() || '0'} Discussions
          </span>
        </button>

        {/* Links display (non-interactive) */}
        <div className={styles.linksDisplay}>
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
          </svg>
          <span>{((post.creatorLinks?.length || 0) + (post.communityLinks?.length || 0))} Links</span>
        </div>

        <button
          className={styles.shareBtn}
          onClick={handleShare}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3"></circle>
            <circle cx="6" cy="12" r="3"></circle>
            <circle cx="18" cy="19" r="3"></circle>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
          </svg>
          <span>Share</span>
        </button>
      </div>

      {isSaveModalOpen && (
        <PostSaveModal
          isOpen={isSaveModalOpen}
          onClose={() => setIsSaveModalOpen(false)}
          post={post}
          onSave={(result) => {
            setIsSaveModalOpen(false);
          }}
        />
      )}

      {isShareModalOpen && (
        <ShareModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          postData={post}
        />
      )}

      {isReportModalOpen && reportContent && (
        <ReportModal
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          onSubmit={handleReportSubmit}
          contentDetails={{
            postId: reportContent.id || reportContent._id,
            userId: reportContent.userId,
            username: reportContent.username,
            title: reportContent.title,
            content: reportContent.content || reportContent.description,
            hashtags: reportContent.hashtags,
            image: reportContent.image
          }}
        />
      )}
    </div>
  );
};

// Move fetchUserProfile outside component for reuse
const fetchUserProfile = async (username) => {
  try {
    const token = localStorage.getItem('token');
    if (!token) return null;

    const response = await fetch(`/api/users/${username}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error(`Error fetching profile for ${username}:`, error);
    return null;
  }
};

// ForumsTabDiscussions component
const ForumsTabDiscussions = ({ forum, onBack }) => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hiddenPostIds, setHiddenPostIds] = useState([]);

  // Handle hiding a post
  const handleHidePost = (postId) => {
    setHiddenPostIds(prev => [...prev, postId]);
    setPosts(prevPosts => prevPosts.filter(post =>
      (post.id !== postId && post._id !== postId)
    ));
  };

  // Fetch user profiles and update posts with profile pictures and timeAgo
  const fetchUserProfiles = async (postsArray) => {
    try {
      // Get unique usernames from posts
      const usernames = [...new Set(postsArray.map(post => post.username))];

      // Fetch profile data for each unique user
      const profileData = {};

      await Promise.all(usernames.map(async (username) => {
        const profile = await fetchUserProfile(username);
        if (profile) {
          profileData[username] = profile;
        }
      }));

      // Update posts with profile pictures and timeAgo
      return postsArray.map(post => {
        const userProfile = profileData[post.username];
        return {
          ...post,
          profilePicture: userProfile?.profilePicture || post.profilePicture || '/profile-placeholder.jpg',
          timeAgo: formatTimeAgo(post.createdAt)
        };
      });
    } catch (error) {
      console.error('Error fetching user profiles:', error);
      return postsArray.map(post => ({
        ...post,
        timeAgo: formatTimeAgo(post.createdAt)
      }));
    }
  };

  // Fetch forum details with posts
  useEffect(() => {
    const fetchForumDetails = async () => {
      try {
        setLoading(true);
        console.log('Fetching posts for forum with ID:', forum.id);

        // Get token from localStorage
        const token = localStorage.getItem('token');
        if (!token) {
          throw new Error('Authentication required');
        }

        // Fetch posts from the API using the real endpoint
        const response = await fetch(`/api/forums/${forum.id}/posts`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Error fetching forum posts: Status ${response.status}, Response: ${errorText}`);
          throw new Error(`Failed to load forum posts: ${response.status}`);
        }

        const data = await response.json();
        console.log('Fetched forum posts:', data);

        // Process the posts
        if (data.posts && Array.isArray(data.posts)) {
          // Fetch hidden posts to filter out any hidden posts
          try {
            const hiddenResponse = await fetch('/api/posts/hidden', {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });

            if (hiddenResponse.ok) {
              const hiddenData = await hiddenResponse.json();
              // Store hidden post IDs
              const hiddenIds = hiddenData.hiddenPosts.map(hp => hp.postId);
              setHiddenPostIds(hiddenIds);

              // Filter out hidden posts
              const filteredPosts = data.posts.filter(post => {
                const postId = post.id || post._id;
                return !hiddenIds.includes(postId);
              });

              // Add timeAgo and fetch profile pictures
              const enhancedPosts = await fetchUserProfiles(filteredPosts);
              
              // NEW: Fetch comment counts for all posts
              console.log('Fetching comment counts for', enhancedPosts.length, 'posts...');
              const postsWithCommentCounts = await fetchCommentCounts(enhancedPosts);
              console.log('Comment counts fetched successfully');
              
              setPosts(postsWithCommentCounts);
            } else {
              // If can't fetch hidden posts, still show all posts
              const enhancedPosts = await fetchUserProfiles(data.posts);
              
              // NEW: Fetch comment counts for all posts
              console.log('Fetching comment counts for', enhancedPosts.length, 'posts...');
              const postsWithCommentCounts = await fetchCommentCounts(enhancedPosts);
              console.log('Comment counts fetched successfully');
              
              setPosts(postsWithCommentCounts);
            }
          } catch (hiddenError) {
            console.error('Error fetching hidden posts:', hiddenError);
            // Still show posts if hidden posts can't be fetched
            const enhancedPosts = await fetchUserProfiles(data.posts);
            
            // NEW: Fetch comment counts for all posts
            console.log('Fetching comment counts for', enhancedPosts.length, 'posts...');
            const postsWithCommentCounts = await fetchCommentCounts(enhancedPosts);
            console.log('Comment counts fetched successfully');
            
            setPosts(postsWithCommentCounts);
          }
        } else {
          setPosts([]);
        }

        setError(null);
      } catch (err) {
        console.error('Error fetching forum details:', err);
        setError(err.message || 'Failed to load forum details');
      } finally {
        setLoading(false);
      }
    };

    // Only fetch if we have a valid forum ID
    if (forum && forum.id) {
      fetchForumDetails();
    } else {
      console.error('No valid forum ID provided');
      setError('Invalid forum data');
      setLoading(false);
    }
  }, [forum]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button className={styles.backButton} onClick={onBack}>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          <span>Back to Forums</span>
        </button>
        <h1 className={styles.forumTitle}>{forum.title}</h1>
      </div>

      <div className={styles.discussionsContainer}>
        {loading ? (
          <div className={styles.loadingContainer}>
            <div className={styles.loadingSpinner}></div>
            <p>Loading discussions...</p>
          </div>
        ) : error ? (
          <div className={styles.errorMessage}>
            <p>{error}</p>
          </div>
        ) : posts.length > 0 ? (
          posts.map(post => (
            <DiscussionPost
              key={post.id || post._id}
              post={post}
              onHidePost={handleHidePost}
            />
          ))
        ) : (
          <div className={styles.emptyState}>
            <p>No discussions in this forum yet.</p>
            <p>Be the first to start a discussion!</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ForumsTabDiscussions;