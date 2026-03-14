'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function WatcherPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  useEffect(() => {
    router.replace(`/dashboard?watcher=${id}`);
  }, [id, router]);

  return null;
}
