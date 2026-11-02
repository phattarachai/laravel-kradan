<?php

declare(strict_types=1);

namespace Phattarachai\Kradan;

use Closure;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Contracts\Auth\UserProvider;
use Illuminate\Support\Facades\Auth;
use Phattarachai\Kradan\Enums\Ability;
use UnhandledMatchError;

/**
 * The host registers who may open Kradan, and how a user is shown:
 *
 *   Kradan::auth(fn ($user, string $ability) => $user->isAdmin());
 *   Kradan::userUsing(fn ($user) => ['id' => $user->id, 'name' => $user->name, 'avatar' => $user->avatar_url]);
 */
final class Kradan
{
    public const string VERSION = '0.4.0';

    /** @var (Closure(Authenticatable, string): ?bool)|null */
    private static ?Closure $authUsing = null;

    /** @var (Closure(Authenticatable): array{id: mixed, name: string, avatar?: ?string})|null */
    private static ?Closure $userUsing = null;

    /** @var array<string, array{id: mixed, name: string, avatar: ?string}> */
    private static array $users = [];

    /**
     * @param  Closure(Authenticatable, string): ?bool  $callback  receives the user and `view`, `manage`, `share` or
     *                                                             `edit`; null for `share` means as `view`
     */
    public static function auth(Closure $callback): void
    {
        self::$authUsing = $callback;
    }

    /**
     * @param  Closure(Authenticatable): array{id: mixed, name: string, avatar?: ?string}  $callback
     */
    public static function userUsing(Closure $callback): void
    {
        self::$userUsing = $callback;
        self::$users = [];
    }

    public static function allows(?Authenticatable $user, Ability $ability): bool
    {
        if (! $user instanceof Authenticatable) {
            return false;
        }

        if (self::$authUsing instanceof Closure) {
            try {
                $answer = call_user_func(self::$authUsing, $user, $ability->value);
            } catch (UnhandledMatchError $unhandled) {
                throw_unless($ability->fallback() instanceof Ability, $unhandled);
                $answer = null;
            }

            $fallback = $ability->fallback();

            return $answer === null && $fallback instanceof Ability ? self::allows($user, $fallback) : (bool) $answer;
        }

        return app()->environment('local');
    }

    public static function user(): ?Authenticatable
    {
        return Auth::guard(config('kradan.guard'))->user();
    }

    /**
     * @return array{id: mixed, name: string, avatar: ?string}
     */
    public static function present(Authenticatable $user): array
    {
        $shape = self::$userUsing instanceof Closure
            ? call_user_func(self::$userUsing, $user)
            : ['id' => $user->getAuthIdentifier(), 'name' => (string) ($user->name ?? $user->getAuthIdentifier())];

        return ['id' => $shape['id'], 'name' => (string) $shape['name'], 'avatar' => $shape['avatar'] ?? null];
    }

    /**
     * @return array{id: mixed, name: string, avatar: ?string}
     */
    public static function userById(?string $id): array
    {
        if ($id === null) {
            return ['id' => null, 'name' => 'Claude', 'avatar' => null];
        }

        return self::$users[$id] ??= self::lookup($id);
    }

    public static function presenceMode(): string
    {
        $mode = (string) config('kradan.presence', 'auto');

        if ($mode !== 'auto') {
            return $mode;
        }

        return config('broadcasting.default') === 'reverb' ? 'reverb' : 'polling';
    }

    /**
     * Copy in Kradan's own locale, whatever the request's locale is.
     *
     * @param  array<string, mixed>  $replace
     */
    public static function trans(string $key, array $replace = []): string
    {
        return (string) trans("kradan::ui.{$key}", $replace, (string) config('kradan.locale', 'th'));
    }

    public static function flush(): void
    {
        self::$authUsing = null;
        self::$userUsing = null;
        self::$users = [];
    }

    /**
     * @return array{id: mixed, name: string, avatar: ?string}
     */
    private static function lookup(string $id): array
    {
        $user = self::provider()?->retrieveById($id);

        return $user instanceof Authenticatable
            ? self::present($user)
            : ['id' => $id, 'name' => self::trans('unknown_user', ['id' => $id]), 'avatar' => null];
    }

    private static function provider(): ?UserProvider
    {
        $guard = config('kradan.guard') ?? config('auth.defaults.guard');
        $provider = config("auth.guards.{$guard}.provider");

        return is_string($provider) ? Auth::createUserProvider($provider) : null;
    }
}
