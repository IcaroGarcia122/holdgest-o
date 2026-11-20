import React, { useState } from "react";
import { Trophy } from "lucide-react";

interface PrizeImageProps {
  src: string;
  alt: string;
  className?: string;
}

export const PrizeImage: React.FC<PrizeImageProps> = ({
  src,
  alt,
  className = "",
}) => {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-[#141414] border border-neutral-800 text-center p-3 ${className}`}
      >
        <Trophy className="w-6 h-6 text-[#FFB000] mb-1.5" />
        <span className="text-[11px] font-medium text-neutral-400 line-clamp-2">
          {alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={`object-cover ${className}`}
    />
  );
};
