import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
}

export default function TalentFlowLogo({ className = '', size = 32 }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} shrink-0`}
    >
      <defs>
        {/* The beautiful blue/purple/magenta gradient from your logo */}
        <linearGradient id="tf-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#EC4899" /> {/* Pink/Magenta */}
          <stop offset="50%" stopColor="#8B5CF6" /> {/* Purple */}
          <stop offset="100%" stopColor="#06B6D4" /> {/* Cyan/Blue */}
        </linearGradient>
      </defs>

      {/* 1. The outer shield outline holding the silhouettes */}
      <path
        d="M100,15 
           C125,15 155,30 162,55 
           C168,75 160,82 165,86
           C170,90 176,92 176,96
           C176,102 168,104 165,108
           C162,112 160,118 152,125
           C140,135 125,148 100,165
           C75,148 60,135 48,125
           C40,118 38,112 35,108
           C32,104 24,102 24,96
           C24,92 30,90 35,86
           C40,82 32,75 38,55
           C45,30 75,15 100,15 Z"
        fill="url(#tf-gradient)"
      />

      {/* 2. Symmetrical inner cutouts to define the left-facing (pink) and right-facing (cyan) outer profiles */}
      {/* Left-facing face profile outline */}
      <path
        d="M72,40 
           C60,40 46,55 48,75
           C50,85 45,88 47,91
           C49,94 53,95 53,98
           C53,101 48,103 47,105
           C46,107 48,111 53,115
           C60,122 72,130 85,138
           L85,40 Z"
        fill="#FFFFFF"
        opacity="0.15"
      />

      {/* Right-facing face profile outline */}
      <path
        d="M128,40 
           C140,40 154,55 152,75
           C150,85 155,88 153,91
           C151,94 147,95 147,98
           C147,101 152,103 153,105
           C154,107 152,111 147,115
           C140,122 128,130 115,138
           L115,40 Z"
        fill="#FFFFFF"
        opacity="0.15"
      />

      {/* 3. Center Cube/Diamond Pedestal at the bottom */}
      <path
        d="M100,155 L128,172 L100,188 L72,172 Z"
        fill="url(#tf-gradient)"
      />
      <path
        d="M100,155 L128,172 L100,188 L100,155 Z"
        fill="#000000"
        opacity="0.1"
      />

      {/* 4. Center White Profile - Facing Right */}
      <path
        d="M80,140 
           C75,130 75,108 77,93 
           C80,72 93,60 110,60 
           C122,60 126,67 124,73 
           C122,78 128,80 128,83 
           C128,86 123,88 121,91 
           C120,93 122,96 122,99 
           C120,104 116,108 115,112 
           C114,116 116,120 115,124 
           L95,140 Z"
        fill="#FFFFFF"
      />

      {/* 5. Growth/Trend Arrow inside the center head */}
      <path
        d="M88,110 L98,100 L106,108 L118,94"
        stroke="url(#tf-gradient)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M110,94 L118,94 L118,102"
        stroke="url(#tf-gradient)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
