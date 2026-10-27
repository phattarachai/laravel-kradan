<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Support;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * The server's token API, called by the kradan:* commands.
 */
final class KradanRemote
{
    private const int TIMEOUT_SECONDS = 120;

    public function url(): string
    {
        return rtrim((string) config('kradan.remote.url'), '/');
    }

    /**
     * @return array{board_url: string, round: int, title: string, steps: int, created: bool}
     */
    public function push(string $zip, string $slug, ?string $taskRef): array
    {
        return $this->request()
            ->attach('bundle', (string) file_get_contents($zip), "{$slug}.zip")
            ->post('push', array_filter(['slug' => $slug, 'task_ref' => $taskRef], fn (?string $value): bool => $value !== null && $value !== ''))
            ->throw()
            ->json();
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function boards(): array
    {
        return $this->request()->get('boards')->throw()->json('boards');
    }

    /**
     * @return array{board: array<string, mixed>, rounds: list<array{number: int, title: string, json: array<string, mixed>, markdown: string}>}
     */
    public function review(string $slug): array
    {
        return $this->request()->get('boards/'.rawurlencode($slug).'/review')->throw()->json();
    }

    /**
     * @return array<string, mixed>
     */
    public function decide(string $slug): array
    {
        return $this->request()->post('boards/'.rawurlencode($slug).'/decide')->throw()->json('board');
    }

    /**
     * An upload from a signed URL in a review; the signature is the credential.
     */
    public function download(string $url): string
    {
        return Http::timeout(self::TIMEOUT_SECONDS)->get($url)->throw()->body();
    }

    private function request(): PendingRequest
    {
        $token = (string) config('kradan.remote.token');
        throw_if($this->url() === '', RuntimeException::class, 'KRADAN_REMOTE_URL is not set: the URL of the app Kradan runs on.');
        throw_if($token === '', RuntimeException::class, 'KRADAN_REMOTE_TOKEN is not set: run `php artisan kradan:token --write`.');

        $path = trim((string) config('kradan.path', 'kradan'), '/');

        return Http::baseUrl("{$this->url()}/{$path}/api/v1")
            ->withToken($token)
            ->acceptJson()
            ->timeout(self::TIMEOUT_SECONDS);
    }
}
