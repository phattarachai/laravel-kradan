<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Console;

use Illuminate\Console\Command;
use Illuminate\Filesystem\Filesystem;
use Illuminate\Support\Str;

final class TokenCommand extends Command
{
    private const int LENGTH = 64;

    private const string KEY = 'KRADAN_REMOTE_TOKEN';

    protected $signature = 'kradan:token {--write : save the plaintext into this checkout\'s .env and print only the hash}';

    protected $description = 'Issue a token for the Kradan API: the plaintext goes in the local .env, its sha256 in the server\'s KRADAN_TOKEN_HASHES';

    public function handle(Filesystem $files): int
    {
        $token = Str::random(self::LENGTH);

        if ($this->option('write')) {
            $this->writeToEnv($files, $token);
            $this->components->twoColumnDetail('local .env', self::KEY.'=… (written to '.$this->laravel->environmentFilePath().')');
        }

        if (! $this->option('write')) {
            $this->components->twoColumnDetail('local .env', self::KEY."={$token}");
        }

        $this->components->twoColumnDetail('server .env', 'KRADAN_TOKEN_HASHES='.hash('sha256', $token));
        $this->components->info('To rotate, append the new hash after a comma, switch the local token, then drop the old hash.');

        return self::SUCCESS;
    }

    private function writeToEnv(Filesystem $files, string $token): void
    {
        $path = $this->laravel->environmentFilePath();
        $env = $files->exists($path) ? $files->get($path) : '';
        $line = self::KEY."={$token}";

        $files->put($path, preg_match('/^'.self::KEY.'=.*$/m', $env) === 1
            ? (string) preg_replace('/^'.self::KEY.'=.*$/m', $line, $env)
            : rtrim($env)."\n{$line}\n");
    }
}
