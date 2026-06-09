import { Image, Skeleton, UnstyledButton } from "@mantine/core";
import { useEffect, useState } from "react";
import { ensureAuth } from "../auth.js";

export function AuthImage({
  src,
  alt,
  w = 120,
  h = 120,
  onClick,
}: {
  src: string;
  alt: string;
  w?: number;
  h?: number;
  onClick?: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;

    void (async () => {
      try {
        const token = await ensureAuth();
        const res = await fetch(src, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (alive) setUrl(objectUrl);
      } catch {
        /* ignore */
      }
    })();

    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (!url) return <Skeleton w={w} h={h} radius="sm" />;
  const img = <Image src={url} alt={alt} w={w} h={h} fit="cover" radius="sm" />;
  if (!onClick) return img;
  return (
    <UnstyledButton onClick={onClick} aria-label={`View ${alt}`} style={{ display: "block", cursor: "pointer" }}>
      {img}
    </UnstyledButton>
  );
}
