<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Support;

use Illuminate\Support\Facades\Date;
use Phattarachai\Kradan\Models\Item;
use Phattarachai\Kradan\Models\Round;

/**
 * @see 1-architecture.md "Content": the signature covers the round and the
 * expiry only, so every relative link under the prefix stays valid.
 */
final class ContentSigner
{
    public const string AGENT = '__kradan/agent.js';

    public function baseUrl(Round $round): string
    {
        $expires = $this->expires();

        return $this->prefix($round->id, $expires, $this->sign($round->id, $expires));
    }

    public function agentUrl(int $round, int $expires, string $signature): string
    {
        return $this->prefix($round, $expires, $signature).self::AGENT;
    }

    /**
     * An uploaded image or file, on the content host like round files.
     */
    public function fileUrl(Item $item): string
    {
        $expires = $this->expires();
        $root = rtrim((string) (config('kradan.content_url') ?: url('/')), '/');
        $path = trim((string) config('kradan.path', 'kradan'), '/');
        $name = rawurlencode((string) $item->file_name);

        return "{$root}/{$path}/files/{$item->id}/{$expires}/{$this->signFile($item->id, $expires)}/{$name}";
    }

    public function validFile(int $item, int $expires, string $signature): bool
    {
        return $expires >= Date::now()->getTimestamp()
            && hash_equals($this->signFile($item, $expires), $signature);
    }

    public function valid(int $round, int $expires, string $signature): bool
    {
        return $expires >= Date::now()->getTimestamp()
            && hash_equals($this->sign($round, $expires), $signature);
    }

    public function sign(int $round, int $expires): string
    {
        return substr(hash_hmac('sha256', "kradan-content|{$round}|{$expires}", $this->key()), 0, 40);
    }

    private function signFile(int $item, int $expires): string
    {
        return substr(hash_hmac('sha256', "kradan-file|{$item}|{$expires}", $this->key()), 0, 40);
    }

    private function prefix(int $round, int $expires, string $signature): string
    {
        $root = rtrim((string) (config('kradan.content_url') ?: url('/')), '/');
        $path = trim((string) config('kradan.path', 'kradan'), '/');

        return "{$root}/{$path}/f/{$round}/{$expires}/{$signature}/";
    }

    /**
     * Rounded up to the hour, so a board reopened within the hour gets the
     * same URLs and the browser cache still applies.
     */
    private function expires(): int
    {
        $at = Date::now()->addMinutes((int) config('kradan.signed_ttl', 240))->getTimestamp();

        return (int) (ceil($at / 3600) * 3600);
    }

    private function key(): string
    {
        $key = (string) config('app.key');

        return str_starts_with($key, 'base64:') ? (string) base64_decode(substr($key, 7), strict: true) : $key;
    }
}
