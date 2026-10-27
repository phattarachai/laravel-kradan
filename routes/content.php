<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Phattarachai\Kradan\Http\Controllers\AssetController;
use Phattarachai\Kradan\Http\Controllers\ContentController;
use Phattarachai\Kradan\Http\Controllers\FileController;

Route::get('f/{round}/{expires}/{signature}/{path?}', ContentController::class)
    ->whereNumber(['round', 'expires'])
    ->where('signature', '[a-f0-9]+')
    ->where('path', '.*')
    ->name('content');

Route::get('files/{item}/{expires}/{signature}/{name?}', FileController::class)
    ->whereNumber(['item', 'expires'])
    ->where('signature', '[a-f0-9]+')
    ->where('name', '.*')
    ->name('file');

Route::get('assets/{file}', AssetController::class)
    ->where('file', '[a-z0-9.-]+')
    ->name('asset');
